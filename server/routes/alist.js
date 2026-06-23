/* alist 目录浏览路由：列出目录内容，过滤视频文件 */
import { Hono } from 'hono';
import {
  getAlistBase,
  isVideoName,
  normalizeAlistFileUrl,
  postAlistJson,
} from '../utils/alist.js';
import { encryptSecret } from '../utils/secret.js';

const alist = new Hono();

/* 自然排序：将文件名拆分为数字和文本段，数字段按数值比较
   解决 "1, 10, 11, 2, 20" → "1, 2, 3, ..., 10, 11" 的排序问题 */
function naturalCompare(a, b) {
  const re = /(\d+)|(\D+)/g;
  const aParts = a.match(re) || [];
  const bParts = b.match(re) || [];
  const len = Math.min(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    if (/^\d+$/.test(aParts[i]) && /^\d+$/.test(bParts[i])) {
      const diff = parseInt(aParts[i], 10) - parseInt(bParts[i], 10);
      if (diff !== 0) return diff;
    } else {
      const cmp = aParts[i].localeCompare(bParts[i]);
      if (cmp !== 0) return cmp;
    }
  }
  return aParts.length - bParts.length;
}

/* POST /api/alist/browse —— 浏览 alist 目录 */
alist.post('/browse', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求格式错误' }, 400);
  }

  const path = (body.path || '/').trim();
  const password = body.password || '';

  if (!path.startsWith('/')) {
    return c.json({ error: '路径必须以 / 开头' }, 400);
  }

  /* 从环境变量读取 alist 配置 */
  const alistBase = getAlistBase(c.env);

  if (!alistBase) {
    return c.json({ error: alistBase === null ? 'ALIST_BASE 配置不是有效 URL' : '未配置 ALIST_BASE 环境变量' }, 500);
  }

  /* 调用 alist API 列出目录内容 */
  try {
    const apiResp = await postAlistJson(alistBase, '/api/fs/list', c.env, {
      path,
      password,
      page: 1,
      per_page: 0,  // 0 = 不分页，返回全部
      refresh: false,
    });

    if (!apiResp.ok) {
      return c.json({ error: `alist API 请求失败 (${apiResp.status})` }, 502);
    }

    const data = apiResp.data;

    if (data?.code !== 200) {
      /* 密码错误或无权限 */
      if (data?.code === 403 || data?.message?.includes('password')) {
        return c.json({ error: '目录访问受限，请填写正确的密码', need_password: true }, 403);
      }
      return c.json({ error: data?.message || 'alist API 返回错误' }, 502);
    }

    let items = (data.data?.content || []).map((item) => ({
      name: item.name,
      size: item.size,
      is_dir: item.is_dir,
      modified: item.modified,
      /* 如果是视频文件，构造完整的 alist 路径 */
      path: path === '/' ? `/${item.name}` : `${path}/${item.name}`,
      is_video: !item.is_dir && isVideoName(item.name),
    }));

    /* 文件夹按名称排序，视频按自然排序 */
    const directories = items.filter((i) => i.is_dir).sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    const videos = items.filter((i) => i.is_video).sort((a, b) => naturalCompare(a.name, b.name));

    return c.json({
      path,
      directories,
      videos,
      total: items.length,
    });
  } catch (e) {
    return c.json({ error: `请求 alist 失败：${e.message}` }, 502);
  }
});

/* POST /api/alist/batch-add —— 批量添加视频到数据库
   支持可选 series 参数：填了系列名，会自动按自然排序编号 episode */
alist.post('/batch-add', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求格式错误' }, 400);
  }

  const { videos: videoList, alist_password, series } = body;

  if (!Array.isArray(videoList) || videoList.length === 0) {
    return c.json({ error: '没有要添加的视频' }, 400);
  }

  if (videoList.length > 100) {
    return c.json({ error: '单次最多添加 100 个视频' }, 400);
  }

  /* 如果有系列名，先按自然排序排好序再编号 */
  let sortedList = videoList;
  if (series && typeof series === 'string' && series.trim()) {
    sortedList = [...videoList].sort((a, b) => naturalCompare(a.title || a.url || '', b.title || b.url || ''));
  }
  const seriesName = series && typeof series === 'string' && series.trim() ? series.trim().slice(0, 200) : null;

  const db = c.env.DB;
  const configuredBase = getAlistBase(c.env);
  if (configuredBase === null) {
    return c.json({ error: 'ALIST_BASE 配置不是有效 URL' }, 500);
  }
  const alistBase = configuredBase || '';
  const now = Math.floor(Date.now() / 1000);
  const results = { success: 0, skipped: 0, errors: [] };
  const rawAlistPassword = alist_password && typeof alist_password === 'string'
    ? alist_password.slice(0, 200)
    : null;
  const storedAlistPassword = await encryptSecret(rawAlistPassword, c.env.SESSION_SECRET);

  const normalizedList = [];
  for (const v of sortedList) {
    if (!v.title || !v.url) {
      results.errors.push(`跳过无效项：${v.title || '未知'}`);
      continue;
    }
    const normalized = normalizeAlistFileUrl(alistBase, v.url);
    if (!normalized.ok) {
      results.errors.push(`跳过 "${v.title}"：${normalized.error}`);
      continue;
    }
    normalizedList.push({ ...v, fullUrl: normalized.url });
  }

  if (normalizedList.length === 0) {
    return c.json(results);
  }

  /* 批量检查已存在的 URL，减少数据库查询次数 */
  const urlsToCheck = normalizedList.map((v) => v.fullUrl);

  /* 批量查询数据库中已存在的 URL（单条 IN 查询代替 N 次 SELECT） */
  const existingUrls = new Set();
  if (urlsToCheck.length > 0) {
    const placeholders = urlsToCheck.map(() => '?').join(',');
    const existing = await db
      .prepare(`SELECT url FROM videos WHERE url IN (${placeholders})`)
      .bind(...urlsToCheck)
      .all();
    (existing.results || []).forEach((r) => existingUrls.add(r.url));
  }

  for (let i = 0; i < normalizedList.length; i++) {
    const v = normalizedList[i];
    /* 检查是否已存在相同 URL */
    if (existingUrls.has(v.fullUrl)) {
      results.skipped++;
      continue;
    }

    try {
      await db
        .prepare(
          `INSERT INTO videos (title, url, cover, description, duration, sort_order, series, episode, alist_password, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          v.title.slice(0, 200),
          v.fullUrl,
          v.cover || null,
          v.description || null,
          Number(v.duration) || 0,
          Number(v.sort_order) || 0,
          seriesName,
          seriesName ? i + 1 : 0,
          storedAlistPassword,
          now,
          now
        )
        .run();
      results.success++;
    } catch (e) {
      results.errors.push(`添加失败 "${v.title}"：${e.message}`);
    }
  }

  /* 如果有系列名，确保 series 表中有对应记录 */
  if (seriesName && results.success > 0) {
    const seriesCover = (body.series_cover && typeof body.series_cover === 'string' && body.series_cover.trim())
      ? body.series_cover.trim() : null;
    const existingSeries = await db
      .prepare(`SELECT id, cover FROM series WHERE name = ?`)
      .bind(seriesName)
      .first();
    if (existingSeries) {
      /* 更新封面（如果提供了） */
      if (seriesCover) {
        await db
          .prepare(`UPDATE series SET cover = ?, updated_at = ? WHERE id = ?`)
          .bind(seriesCover, now, existingSeries.id)
          .run();
      }
    } else {
      await db
        .prepare(
          `INSERT INTO series (name, cover, description, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(seriesName, seriesCover, null, 0, now, now)
        .run();
    }
  }

  return c.json(results);
});

export default alist;
