/* 系列路由：列表、详情、编辑 */
import { Hono } from 'hono';
import { isGuest } from '../middleware/auth.js';

const series = new Hono();

/* GET /api/series —— 列表，每个系列带集数、完成数、进度
   同时包含 videos 表中有 series 字段但在 series 表中无对应记录的系列 */
series.get('/', async (c) => {
  const db = c.env.DB;
  const guest = isGuest(c);

  /* 一次性补录所有孤儿系列（INSERT OR IGNORE 避免逐个插入和冲突） */
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT OR IGNORE INTO series (name, cover, description, sort_order, created_at, updated_at)
       SELECT DISTINCT v.series, NULL, NULL, 0, ?, ?
       FROM videos v
       WHERE v.series IS NOT NULL AND v.series != ''
         AND NOT EXISTS (SELECT 1 FROM series s WHERE s.name = v.series)`
    )
    .bind(now, now)
    .run();

  /* 一次查询完整列表（含集数统计） */
  const finalRows = await db
    .prepare(
      `SELECT s.*,
              COUNT(v.id) AS episode_count
       FROM series s
       LEFT JOIN videos v ON v.series = s.name
       GROUP BY s.id
       ORDER BY s.sort_order DESC, s.created_at ASC`
    )
    .all();

  /* 再查一次带观看进度的统计 */
  const progressRows = await db
    .prepare(
      `SELECT v.series AS series_name,
              COUNT(v.id) AS total,
              SUM(CASE WHEN h.completed = 1 THEN 1 ELSE 0 END) AS completed_count,
              SUM(CASE WHEN h.last_watch_at IS NOT NULL AND h.completed = 0 THEN 1 ELSE 0 END) AS in_progress
       FROM videos v
       LEFT JOIN (
         SELECT video_id, MAX(last_watch_at) AS mx
         FROM watch_history
         GROUP BY video_id
       ) m ON m.video_id = v.id
       LEFT JOIN watch_history h ON h.video_id = v.id AND h.last_watch_at = m.mx
       WHERE v.series IS NOT NULL AND v.series != ''
       GROUP BY v.series`
    )
    .all();

  const progressMap = new Map();
  for (const r of (progressRows.results || [])) {
    progressMap.set(r.series_name, {
      total: r.total || 0,
      completed: r.completed_count || 0,
      in_progress: r.in_progress || 0,
    });
  }

  const list = (finalRows.results || []).map((r) => {
    const p = guest ? { total: 0, completed: 0, in_progress: 0 } : (progressMap.get(r.name) || { total: 0, completed: 0, in_progress: 0 });
    return {
      id: r.id,
      name: r.name,
      cover: r.cover || '',
      description: r.description || '',
      sort_order: r.sort_order || 0,
      episode_count: p.total,
      completed_count: p.completed,
      in_progress_count: p.in_progress,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });

  return c.json({ series: list });
});

/* GET /api/series/:id —— 系列详情 + 所有集数视频 */
series.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: '无效的系列 ID' }, 400);
  }
  const db = c.env.DB;
  const guest = isGuest(c);
  const s = await db.prepare(`SELECT * FROM series WHERE id = ?`).bind(id).first();
  if (!s) return c.json({ error: '系列不存在' }, 404);

  const videoRows = await db
    .prepare(
      `SELECT v.*,
              h.progress      AS last_progress,
              h.completed     AS completed,
              h.last_watch_at AS last_watched_at,
              h.duration      AS history_duration
       FROM videos v
       LEFT JOIN (
         SELECT video_id, MAX(last_watch_at) AS mx
         FROM watch_history
         GROUP BY video_id
       ) m ON m.video_id = v.id
       LEFT JOIN watch_history h ON h.video_id = v.id AND h.last_watch_at = m.mx
       WHERE v.series = ?
       ORDER BY v.episode ASC, v.sort_order DESC, v.created_at ASC`
    )
    .bind(s.name)
    .all();

  const episodes = (videoRows.results || []).map((r) => ({
    id: r.id,
    title: r.title,
    url: guest ? '' : r.url,
    cover: r.cover,
    series_cover: s.cover || '',
    description: r.description,
    duration: r.duration,
    sort_order: r.sort_order,
    series: r.series || '',
    episode: r.episode || 0,
    has_password: guest ? 0 : (r.alist_password ? 1 : 0),
    created_at: r.created_at,
    updated_at: r.updated_at,
    last_progress: guest ? 0 : (r.last_progress || 0),
    completed: guest ? 0 : (r.completed ? 1 : 0),
    last_watched_at: guest ? null : (r.last_watched_at || null),
  }));

  const completedCount = guest ? 0 : episodes.filter((e) => e.completed).length;

  return c.json({
    series: {
      id: s.id,
      name: s.name,
      cover: s.cover || '',
      description: s.description || '',
      sort_order: s.sort_order || 0,
      created_at: s.created_at,
      updated_at: s.updated_at,
    },
    episodes,
    episode_count: episodes.length,
    completed_count: completedCount,
  });
});

/* PUT /api/series/:id —— 编辑系列（封面、描述、排序） */
series.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: '无效的系列 ID' }, 400);
  }
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求格式错误' }, 400);
  }

  const fields = [];
  const vals = [];

  if (body.cover !== undefined) {
    fields.push('cover = ?');
    vals.push(typeof body.cover === 'string' && body.cover.trim() ? body.cover.trim() : null);
  }
  if (body.description !== undefined) {
    fields.push('description = ?');
    vals.push(typeof body.description === 'string' ? body.description.slice(0, 2000) : null);
  }
  if (body.sort_order !== undefined) {
    const s = Number(body.sort_order);
    fields.push('sort_order = ?');
    vals.push(Number.isFinite(s) ? Math.floor(s) : 0);
  }

  if (fields.length === 0) {
    return c.json({ error: '没有要更新的字段' }, 400);
  }

  const db = c.env.DB;
  const existing = await db.prepare(`SELECT id FROM series WHERE id = ?`).bind(id).first();
  if (!existing) return c.json({ error: '系列不存在' }, 404);

  fields.push('updated_at = ?');
  vals.push(Math.floor(Date.now() / 1000));
  vals.push(id);
  await db.prepare(`UPDATE series SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();

  const s = await db.prepare(`SELECT * FROM series WHERE id = ?`).bind(id).first();
  return c.json({ series: s });
});

export default series;
