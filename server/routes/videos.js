/* 视频路由：CRUD，列表/详情 JOIN 最新观看进度 */
import { Hono } from 'hono';
import { encryptSecret } from '../utils/secret.js';

const videos = new Hono();

/* 确保 series 表有对应记录（视频设置 series 时自动创建） */
async function ensureSeries(db, seriesName) {
  if (!seriesName || typeof seriesName !== 'string') return;
  const name = seriesName.trim();
  if (!name) return;
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(`INSERT OR IGNORE INTO series (name, cover, description, sort_order, created_at, updated_at) VALUES (?, NULL, NULL, 0, ?, ?)`)
    .bind(name, now, now)
    .run();
}

function validateVideoInput(body, partial = false) {
  const errors = [];
  const out = {};
  if (!partial || body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length === 0) {
      errors.push('标题不能为空');
    } else if (body.title.length > 200) {
      errors.push('标题过长');
    } else {
      out.title = body.title.trim();
    }
  }
  if (!partial || body.url !== undefined) {
    if (typeof body.url !== 'string' || body.url.trim().length === 0) {
      errors.push('视频链接不能为空');
    } else if (body.url.length > 2000) {
      errors.push('视频链接过长');
    } else {
      out.url = body.url.trim();
    }
  }
  if (body.cover !== undefined) {
    out.cover = typeof body.cover === 'string' && body.cover.trim() ? body.cover.trim() : null;
  }
  if (body.description !== undefined) {
    out.description = typeof body.description === 'string' ? body.description.slice(0, 2000) : null;
  }
  if (body.duration !== undefined) {
    const d = Number(body.duration);
    out.duration = Number.isFinite(d) && d >= 0 ? Math.floor(d) : 0;
  }
  if (body.sort_order !== undefined) {
    const s = Number(body.sort_order);
    out.sort_order = Number.isFinite(s) ? Math.floor(s) : 0;
  }
  /* alist 目录访问密码（可选）：用于访问设了密码的目录 */
  if (body.alist_password !== undefined) {
    out.alist_password =
      typeof body.alist_password === 'string' && body.alist_password.length > 0
        ? body.alist_password.slice(0, 200)
        : null;
  }
  /* 系列（可选）：同名的视频归为同一系列 */
  if (body.series !== undefined) {
    out.series = typeof body.series === 'string' && body.series.trim() ? body.series.trim().slice(0, 200) : null;
  }
  /* 集数（可选）：系列内按集数排序 */
  if (body.episode !== undefined) {
    const e = Number(body.episode);
    out.episode = Number.isFinite(e) && e >= 0 ? Math.floor(e) : 0;
  }
  return { errors, out };
}

/* GET /api/videos —— 列表，每条带最新观看进度
   排序规则：
   1. 有系列的视频在前，按系列名分组，系列内按 episode 排序
   2. 无系列的视频在后，按 sort_order DESC, created_at DESC

   使用子查询而非 JOIN，彻底避免 watch_history 多条记录导致重复行 */
videos.get('/', async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare(
      `SELECT v.*,
              (SELECT cover FROM series WHERE name = v.series LIMIT 1) AS series_cover,
              (SELECT progress      FROM watch_history WHERE video_id = v.id ORDER BY last_watch_at DESC, id DESC LIMIT 1) AS last_progress,
              (SELECT completed    FROM watch_history WHERE video_id = v.id ORDER BY last_watch_at DESC, id DESC LIMIT 1) AS completed,
              (SELECT last_watch_at FROM watch_history WHERE video_id = v.id ORDER BY last_watch_at DESC, id DESC LIMIT 1) AS last_watched_at
       FROM videos v
       ORDER BY
         CASE WHEN v.series IS NULL OR v.series = '' THEN 1 ELSE 0 END,
         v.series ASC,
         v.episode ASC,
         v.sort_order DESC,
         v.created_at DESC`
    )
    .all();
  const list = (rows.results || []).map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    cover: r.cover,
    series_cover: r.series_cover || '',
    description: r.description,
    duration: r.duration,
    sort_order: r.sort_order,
    series: r.series || '',
    episode: r.episode || 0,
    /* alist_password 不返回到列表，避免泄露；只在编辑时单独取 */
    has_password: r.alist_password ? 1 : 0,
    created_at: r.created_at,
    updated_at: r.updated_at,
    last_progress: r.last_progress || 0,
    completed: r.completed ? 1 : 0,
    last_watched_at: r.last_watched_at || null,
  }));
  return c.json({ videos: list });
});

/* GET /api/videos/:id —— 详情 + 最新历史 */
videos.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: '无效的视频 ID' }, 400);
  }
  const db = c.env.DB;
  const v = await db
    .prepare(`SELECT v.*, (SELECT cover FROM series WHERE name = v.series LIMIT 1) AS series_cover FROM videos v WHERE v.id = ?`)
    .bind(id)
    .first();
  if (!v) return c.json({ error: '视频不存在' }, 404);
  const h = await db
    .prepare(
      `SELECT * FROM watch_history WHERE video_id = ? ORDER BY last_watch_at DESC LIMIT 1`
    )
    .bind(id)
    .first();
  return c.json({
    video: {
      id: v.id,
      title: v.title,
      url: v.url,
      cover: v.cover,
      series_cover: v.series_cover || '',
      description: v.description,
      duration: v.duration,
      sort_order: v.sort_order,
      series: v.series || '',
      episode: v.episode || 0,
      /* alist_password 不在详情接口返回明文，编辑表单通过 has_password 判断是否已设置 */
      has_password: v.alist_password ? 1 : 0,
      created_at: v.created_at,
      updated_at: v.updated_at,
    },
    history: h
      ? {
          progress: h.progress,
          completed: h.completed ? 1 : 0,
          last_watch_at: h.last_watch_at,
          duration: h.duration,
        }
      : null,
  });
});

/* POST /api/videos */
videos.post('/', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求格式错误' }, 400);
  }
  const { errors, out } = validateVideoInput(body || {});
  if (errors.length) return c.json({ error: errors[0] }, 400);
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const alistPassword = await encryptSecret(out.alist_password ?? null, c.env.SESSION_SECRET);
  const res = await db
    .prepare(
      `INSERT INTO videos (title, url, cover, description, duration, sort_order, series, episode, alist_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      out.title,
      out.url,
      out.cover ?? null,
      out.description ?? null,
      out.duration ?? 0,
      out.sort_order ?? 0,
      out.series ?? null,
      out.episode ?? 0,
      alistPassword,
      now,
      now
    )
    .run();
  const id = res.meta?.last_row_id;
  if (out.series) await ensureSeries(db, out.series);
  const v = await db.prepare(`SELECT * FROM videos WHERE id = ?`).bind(id).first();
  /* 不返回 alist_password 明文 */
  const sanitized = { ...v, has_password: v.alist_password ? 1 : 0 };
  delete sanitized.alist_password;
  return c.json({ video: sanitized }, 201);
});

/* PUT /api/videos/:id */
videos.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: '无效的视频 ID' }, 400);
  }
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求格式错误' }, 400);
  }
  const { errors, out } = validateVideoInput(body || {}, true);
  if (errors.length) return c.json({ error: errors[0] }, 400);
  if (Object.prototype.hasOwnProperty.call(out, 'alist_password')) {
    out.alist_password = await encryptSecret(out.alist_password, c.env.SESSION_SECRET);
  }
  const db = c.env.DB;
  const existing = await db.prepare(`SELECT id FROM videos WHERE id = ?`).bind(id).first();
  if (!existing) return c.json({ error: '视频不存在' }, 404);
  const fields = [];
  const vals = [];
  for (const [k, v] of Object.entries(out)) {
    fields.push(`${k} = ?`);
    vals.push(v);
  }
  if (fields.length === 0) return c.json({ error: '没有要更新的字段' }, 400);
  fields.push(`updated_at = ?`);
  vals.push(Math.floor(Date.now() / 1000));
  vals.push(id);
  await db.prepare(`UPDATE videos SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  if (out.series) await ensureSeries(db, out.series);
  const v = await db.prepare(`SELECT * FROM videos WHERE id = ?`).bind(id).first();
  /* 不返回 alist_password 明文 */
  const sanitized = { ...v, has_password: v.alist_password ? 1 : 0 };
  delete sanitized.alist_password;
  return c.json({ video: sanitized });
});

/* DELETE /api/videos/:id —— 级联删历史（事务保证原子性） */
videos.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: '无效的视频 ID' }, 400);
  }
  const db = c.env.DB;
  await db.batch([
    db.prepare(`DELETE FROM watch_history WHERE video_id = ?`).bind(id),
    db.prepare(`DELETE FROM videos WHERE id = ?`).bind(id),
  ]);
  return c.json({ ok: true });
});

/* POST /api/videos/batch-delete —— 批量删除（事务保证原子性） */
videos.post('/batch-delete', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求格式错误' }, 400);
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => Number.isInteger(id) && id > 0) : [];
  if (ids.length === 0) {
    return c.json({ error: '没有要删除的视频' }, 400);
  }
  if (ids.length > 200) {
    return c.json({ error: '单次最多删除 200 个' }, 400);
  }
  const db = c.env.DB;
  const placeholders = ids.map(() => '?').join(',');
  await db.batch([
    db.prepare(`DELETE FROM watch_history WHERE video_id IN (${placeholders})`).bind(...ids),
    db.prepare(`DELETE FROM videos WHERE id IN (${placeholders})`).bind(...ids),
  ]);
  return c.json({ ok: true, deleted: ids.length });
});

/* POST /api/videos/batch-update —— 批量更新（封面、系列等） */
videos.post('/batch-update', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求格式错误' }, 400);
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => Number.isInteger(id) && id > 0) : [];
  if (ids.length === 0) {
    return c.json({ error: '没有要更新的视频' }, 400);
  }
  if (ids.length > 200) {
    return c.json({ error: '单次最多更新 200 个' }, 400);
  }

  const fields = [];
  const vals = [];
  if (body.cover !== undefined) {
    fields.push('cover = ?');
    vals.push(body.cover && typeof body.cover === 'string' ? body.cover.trim() : null);
  }
  if (body.alist_password !== undefined) {
    fields.push('alist_password = ?');
    const rawPassword = body.alist_password && typeof body.alist_password === 'string'
      ? body.alist_password.slice(0, 200)
      : null;
    vals.push(await encryptSecret(rawPassword, c.env.SESSION_SECRET));
  }
  if (body.series !== undefined) {
    fields.push('series = ?');
    vals.push(body.series && typeof body.series === 'string' && body.series.trim() ? body.series.trim().slice(0, 200) : null);
  }
  if (fields.length === 0) {
    return c.json({ error: '没有要更新的字段' }, 400);
  }

  fields.push('updated_at = ?');
  vals.push(Math.floor(Date.now() / 1000));

  const db = c.env.DB;
  const placeholders = ids.map(() => '?').join(',');
  vals.push(...ids);
  await db.prepare(`UPDATE videos SET ${fields.join(', ')} WHERE id IN (${placeholders})`).bind(...vals).run();
  if (body.series) await ensureSeries(db, body.series);
  return c.json({ ok: true, updated: ids.length });
});

/* POST /api/videos/reorder —— 批量排序（支持 sort_order 和 episode） */
videos.post('/reorder', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求格式错误' }, 400);
  }
  const items = Array.isArray(body.items)
    ? body.items.filter(
        (it) =>
          Number.isInteger(it.id) &&
          it.id > 0 &&
          (Number.isFinite(it.sort_order) || Number.isFinite(it.episode))
      )
    : [];
  if (items.length === 0) {
    return c.json({ error: '没有要排序的视频' }, 400);
  }

  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const statements = [];
  for (const item of items) {
    const sets = ['updated_at = ?'];
    const vals = [now];
    if (Number.isFinite(item.sort_order)) {
      sets.unshift('sort_order = ?');
      vals.unshift(Math.floor(item.sort_order));
    }
    if (Number.isFinite(item.episode)) {
      sets.unshift('episode = ?');
      vals.unshift(Math.floor(item.episode));
    }
    vals.push(item.id);
    statements.push(db.prepare(`UPDATE videos SET ${sets.join(', ')} WHERE id = ?`).bind(...vals));
  }
  await db.batch(statements);
  return c.json({ ok: true, reordered: items.length });
});

export default videos;
