/* 观看记录路由：记录(upsert当日)、列表、月历统计 */
import { Hono } from 'hono';
import { isGuest } from '../middleware/auth.js';
import {
  getClientDate,
  getClientMonthBoundsTs,
  getClientTodayStartTs,
  resolveTimezoneOffset,
  toClientDateStr,
} from '../utils/time.js';

const history = new Hono();

function getTimezoneOffset(c, body) {
  return resolveTimezoneOffset(c.req.header('x-timezone-offset'), body);
}

function getWatchedSeconds(record) {
  if (record.completed) return record.duration || record.progress || 0;
  return record.progress || 0;
}

/* POST /api/history { video_id, progress, duration?, completed? } */
history.post('/', async (c) => {
  if (isGuest(c)) {
    return c.json({ history: { id: null, progress: 0, completed: 0, guest: true } });
  }
  let body;
  try {
    const raw = await c.req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return c.json({ error: '请求格式错误' }, 400);
  }
  const videoId = Number(body && body.video_id);
  if (!Number.isInteger(videoId) || videoId <= 0) {
    return c.json({ error: '无效的视频 ID' }, 400);
  }
  const progress = Math.max(0, Math.floor(Number(body.progress) || 0));
  const duration = Math.max(0, Math.floor(Number(body.duration) || 0));
  const completed = body.completed ? 1 : 0;

  const db = c.env.DB;
  const v = await db.prepare(`SELECT id, duration FROM videos WHERE id = ?`).bind(videoId).first();
  if (!v) return c.json({ error: '视频不存在' }, 404);

  const realDuration = duration || v.duration || 0;
  const isCompleted = (completed || (realDuration > 0 && progress >= realDuration * 0.95)) ? 1 : 0;

  const now = Math.floor(Date.now() / 1000);
  /* sendBeacon 无法设请求头，从 body 中取时区偏移作为后备 */
  const effectiveTz = getTimezoneOffset(c, body);
  const todayStartTs = getClientTodayStartTs(effectiveTz);

  /* 找今日的会话（不管是否完成，同一天只保留一条） */
  const sess = await db
    .prepare(
      `SELECT id, completed FROM watch_history
       WHERE video_id = ? AND started_at >= ?
       ORDER BY started_at DESC LIMIT 1`
    )
    .bind(videoId, todayStartTs)
    .first();

  if (sess) {
    /* 今日已有记录：更新它 */
    await db
      .prepare(
        `UPDATE watch_history SET progress = ?, duration = ?, completed = ?, last_watch_at = ? WHERE id = ?`
      )
      .bind(progress, realDuration, isCompleted, now, sess.id)
      .run();
    return c.json({ history: { id: sess.id, progress, completed: isCompleted } });
  }
  /* 今日无记录：插入新记录 */
  const res = await db
    .prepare(
      `INSERT INTO watch_history (video_id, started_at, last_watch_at, progress, duration, completed)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(videoId, now, now, progress, realDuration, isCompleted)
    .run();
  return c.json({ history: { id: res.meta?.last_row_id, progress, completed: isCompleted } }, 201);
});

/* DELETE /api/history/:id —— 删除单条训练记录 */
history.delete('/:id', async (c) => {
  if (isGuest(c)) {
    return c.json({ error: '访客模式无权执行此操作' }, 403);
  }
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: '无效的记录 ID' }, 400);
  }
  const db = c.env.DB;
  await db.prepare(`DELETE FROM watch_history WHERE id = ?`).bind(id).run();
  return c.json({ ok: true });
});

/* GET /api/history?days=30&limit=200 */
history.get('/', async (c) => {
  if (isGuest(c)) {
    return c.json({ history: [] });
  }
  const days = Math.min(365, Math.max(1, Number(c.req.query('days')) || 30));
  const limit = Math.min(500, Math.max(1, Number(c.req.query('limit')) || 200));
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const db = c.env.DB;
  const rows = await db
    .prepare(
      `SELECT h.*,
              v.title AS video_title,
              COALESCE(NULLIF(v.cover, ''), NULLIF(s.cover, '')) AS video_cover,
              v.duration AS video_duration
       FROM watch_history h
       JOIN videos v ON v.id = h.video_id
       LEFT JOIN series s ON s.name = v.series
       WHERE h.started_at >= ?
       ORDER BY h.started_at DESC
       LIMIT ?`
    )
    .bind(since, limit)
    .all();
  const list = (rows.results || []).map((r) => ({
    id: r.id,
    video_id: r.video_id,
    video_title: r.video_title,
    video_cover: r.video_cover,
    started_at: r.started_at,
    last_watch_at: r.last_watch_at,
    progress: r.progress,
    duration: r.duration,
    video_duration: r.video_duration,
    completed: r.completed ? 1 : 0,
  }));
  return c.json({ history: list });
});

/* GET /api/history/stats?month=YYYY-MM */
history.get('/stats', async (c) => {
  const monthParam = c.req.query('month');
  const offsetMin = getTimezoneOffset(c);
  const clientNow = getClientDate(offsetMin);
  let year = clientNow.getUTCFullYear();
  let month = clientNow.getUTCMonth() + 1;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number);
    if (m >= 1 && m <= 12) {
      year = y;
      month = m;
    }
  }
  if (isGuest(c)) {
    return c.json({
      month: `${year}-${String(month).padStart(2, '0')}`,
      stats: [],
      streak: 0,
      month_days: new Date(year, month, 0).getDate(),
      month_train_days: 0,
      month_total_seconds: 0,
      month_completed: 0,
    });
  }
  /* 月份边界按客户端时区计算 */
  const { startTs, endTs } = getClientMonthBoundsTs(year, month, offsetMin);

  const db = c.env.DB;
  const rows = await db
    .prepare(
      `SELECT h.started_at, h.last_watch_at, h.progress, h.duration, h.completed, v.id AS video_id, v.title AS video_title
       FROM watch_history h
       JOIN videos v ON v.id = h.video_id
       WHERE h.started_at >= ? AND h.started_at < ?
       ORDER BY h.started_at DESC`
    )
    .bind(startTs, endTs)
    .all();

  /* 按客户端本地日期分组 */
  const byDate = {};
  for (const r of rows.results || []) {
    const key = toClientDateStr(r.started_at, offsetMin);
    if (!byDate[key]) byDate[key] = { date: key, count: 0, total_seconds: 0, completed: 0, videos: [] };
    byDate[key].count += 1;
    if (r.completed) byDate[key].completed += 1;
    byDate[key].videos.push({
      video_id: r.video_id,
      video_title: r.video_title,
      completed: r.completed ? 1 : 0,
      progress: r.progress,
      duration: r.duration,
    });
  }
  /* total_seconds：已完成按视频时长，未完成按实际观看进度 */
  for (const k of Object.keys(byDate)) {
    let s = 0;
    for (const v of byDate[k].videos) {
      s += getWatchedSeconds(v);
    }
    byDate[k].total_seconds = s;
  }

  /* 连续打卡（streak）：从今天往前数有训练记录的连续天数
     只查最近 366 天避免全表扫描 */
  const streakSince = Math.floor(Date.now() / 1000) - 366 * 86400;
  const recentDates = await db
    .prepare(
      `SELECT DISTINCT started_at FROM watch_history WHERE started_at >= ? ORDER BY started_at DESC`
    )
    .bind(streakSince)
    .all();
  const dateSet = new Set((recentDates.results || []).map((r) => toClientDateStr(r.started_at, offsetMin)));
  let streak = 0;
  const cursor = new Date(clientNow);
  const todayKey = toClientDateStr(Math.floor(Date.now() / 1000), offsetMin);
  if (!dateSet.has(todayKey)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (true) {
    const k = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`;
    if (dateSet.has(k)) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else break;
  }

  const monthDays = new Date(year, month, 0).getDate();
  const monthTotal = Object.values(byDate).reduce((s, d) => s + d.total_seconds, 0);
  const monthCompleted = Object.values(byDate).reduce((s, d) => s + d.completed, 0);

  return c.json({
    month: `${year}-${String(month).padStart(2, '0')}`,
    stats: Object.values(byDate).sort((a, b) => (a.date < b.date ? 1 : -1)),
    streak,
    month_days: monthDays,
    month_train_days: Object.keys(byDate).length,
    month_total_seconds: monthTotal,
    month_completed: monthCompleted,
  });
});

export default history;
