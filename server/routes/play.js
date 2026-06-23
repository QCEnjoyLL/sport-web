/* 播放路由：
   - OpenList 链接：调 /api/fs/get 获取最新 sign，再 302 到 /d/ 代理 URL
   - 普通视频直链：直接 302 给浏览器加载，不经过 Workers 中转 */
import { Hono } from 'hono';
import {
  getConfiguredAlistOrigin,
  postAlistJson,
  VIDEO_URL_EXT,
} from '../utils/alist.js';
import { decryptSecret } from '../utils/secret.js';

const play = new Hono();

play.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: '无效的视频 ID' }, 400);
  }
  const db = c.env.DB;
  const v = await db.prepare('SELECT url, alist_password FROM videos WHERE id = ?').bind(id).first();
  if (!v) return c.json({ error: '视频不存在' }, 404);

  const rawInputUrl = v.url;
  if (!rawInputUrl) return c.json({ error: '视频链接为空' }, 400);

  /* 解析 URL */
  let parsed;
  try {
    parsed = new URL(rawInputUrl);
  } catch {
    return c.json({ error: '视频链接不是有效 URL' }, 400);
  }

  /* 只允许浏览器可安全加载的 http(s) 视频 URL */
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return c.json({ error: '视频链接仅支持 http(s)' }, 400);
  }

  if (!VIDEO_URL_EXT.test(parsed.pathname)) {
    return c.json({ error: '不支持的视频链接格式' }, 400);
  }

  const configuredOrigin = getConfiguredAlistOrigin(c.env);
  if (configuredOrigin === '') {
    return c.json({ error: 'ALIST_BASE 配置不是有效 URL' }, 500);
  }

  /* 非 OpenList 域名的 http(s) 视频直链直接播放。
     只有匹配 ALIST_BASE 的链接才需要刷新 OpenList sign。 */
  if (!configuredOrigin || parsed.origin !== configuredOrigin) {
    return c.redirect(rawInputUrl);
  }

  const alistBase = `${parsed.protocol}//${parsed.host}`;

  /* 提取 alist 文件路径（去掉 /d 前缀，统一处理） */
  let alistPath;
  if (parsed.pathname.startsWith('/d/')) {
    alistPath = decodeURIComponent(parsed.pathname.slice(2));
  } else {
    alistPath = decodeURIComponent(parsed.pathname);
  }

  /* 调 /api/fs/get 获取最新 sign
     每次都调，因为 sign 有时效性，用户复制的旧 sign 可能已失效 */
  const alistToken = c.env.ALIST_TOKEN;
  const reqBody = { path: alistPath, password: '' };
  if (v.alist_password) {
    try {
      reqBody.password = await decryptSecret(v.alist_password, c.env.SESSION_SECRET);
    } catch {
      return c.json({ error: 'OpenList 目录密码解密失败，请在管理页重新保存密码' }, 500);
    }
  }

  let sign = null;
  try {
    const apiResp = await postAlistJson(alistBase, '/api/fs/get', c.env, reqBody);
    if (!apiResp.ok) {
      return c.json({ error: `OpenList API 请求失败 (${apiResp.status})` }, 502);
    }

    const data = apiResp.data;
    if (data && data.code === 200 && data.data) {
      sign = data.data.sign || null;
    } else {
      return c.json(
        {
          error: `OpenList API 错误：${data?.message || '未知'}`,
          code: data?.code,
          hint: !alistToken
            ? '未配置 ALIST_TOKEN'
            : data?.code === 401
            ? 'ALIST_TOKEN 无效'
            : data?.code === 403
            ? '无权访问或需要目录密码'
            : '检查 token 或链接',
        },
        401
      );
    }
  } catch (e) {
    return c.json({ error: `无法连接 OpenList：${e.message}` }, 502);
  }

  /* 构造 /d/ 代理 URL 并 302 重定向
     浏览器直接从 OpenList 加载视频流，不经过 Workers 中转
     - OpenList /d/ 返回 302 到真实视频地址
     - 浏览器跟随 302 到 CDN，CDN 支持 Range（206），可边下边播
     - video 标签不受 CORS 限制，可直接加载跨域资源 */
  const cleanPath = alistPath.replace(/^\/+/, '');
  const encodedPath = encodeURI(cleanPath);
  if (sign) {
    const proxyUrl = `${alistBase}/d/${encodedPath}?sign=${encodeURIComponent(sign)}`;
    return c.redirect(proxyUrl);
  }

  /* 兜底：无 sign 的 /d/ 端点（公开资源） */
  return c.redirect(`${alistBase}/d/${encodedPath}`);
});

export default play;
