/* Alist API helpers shared by browse/import/play routes. */

export const VIDEO_EXTS = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v',
  'mpg', 'mpeg', '3gp', 'ts', 'mts', 'm2ts', 'rm', 'rmvb',
  'vob', 'asf', 'm2v', 'svi', '3g2', 'mxf', 'roq', 'nsv',
]);

export const VIDEO_URL_EXT = /\.(mp4|m4v|webm|mov|mkv|m3u8|ts)(\?|$|#)/i;

export function isVideoName(name) {
  if (!name || typeof name !== 'string') return false;
  const ext = name.split('.').pop().toLowerCase();
  return VIDEO_EXTS.has(ext);
}

export function getConfiguredAlistOrigin(env) {
  const base = (env.ALIST_BASE || '').trim();
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return '';
  }
}

export function getAlistBase(env) {
  const base = (env.ALIST_BASE || '').trim();
  if (!base) return '';
  try {
    const parsed = new URL(base);
    return parsed.origin;
  } catch {
    return null;
  }
}

export function buildAlistHeaders(env) {
  const headers = { 'Content-Type': 'application/json' };
  const token = (env.ALIST_TOKEN || '').trim();
  if (token) headers.Authorization = token;
  return headers;
}

export function joinAlistUrl(base, path) {
  if (!base) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${base.replace(/\/+$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
}

export function isAbsoluteHttpUrl(value) {
  return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
}

export function normalizeAlistFileUrl(base, value) {
  if (!value || typeof value !== 'string') {
    return { ok: false, error: '视频链接为空' };
  }
  const url = value.trim();
  if (!url) return { ok: false, error: '视频链接为空' };
  if (isAbsoluteHttpUrl(url)) return { ok: true, url };
  if (!base) return { ok: false, error: '相对路径需要配置有效的 ALIST_BASE' };
  return { ok: true, url: joinAlistUrl(base, url) };
}

export async function postAlistJson(base, apiPath, env, body) {
  const endpoint = `${base.replace(/\/+$/, '')}${apiPath}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: buildAlistHeaders(env),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return { ok: false, status: response.status, data: null };
  }

  const data = await response.json();
  return { ok: true, status: response.status, data };
}
