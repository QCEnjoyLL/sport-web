/* ============================================================
   Session Token：HMAC-SHA256 签名（Web Crypto，无外部依赖）
   格式：base64url(payload) + "." + base64url(hmac)
   payload = JSON { exp }  （单用户，无需 uid）
   ============================================================ */

const COOKIE_NAME = 'session';
const SESSION_TTL = 30 * 24 * 3600; // 30 天（秒）

function b64urlEncode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signToken(exp, secret) {
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({ exp })));
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  /* 签名内容 = payload 字符串本身的字节（与 signToken 保持一致） */
  const payloadBytes = new TextEncoder().encode(payload);
  const key = await importKey(secret);
  let valid;
  try {
    valid = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), payloadBytes);
  } catch {
    return null;
  }
  if (!valid) return null;
  /* 解析 payload 内容时再 base64url 解码 */
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
  } catch {
    return null;
  }
  if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
  return data;
}

/* 恒定时间字符串比较（防侧信道） */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  /* 长度不同则置 bBytes 为同长度的无关数据，避免短路泄漏比较时长；
     最终通过额外的长度判断确保只有真正相等才返回 true */
  let compareBytes = bBytes;
  if (aBytes.length !== bBytes.length) {
    compareBytes = aBytes;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ compareBytes[i];
  }
  /* 长度必须一致才认为相等 */
  return diff === 0 && aBytes.length === bBytes.length;
}

export function parseCookie(cookieHeader, name = COOKIE_NAME) {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const p of pairs) {
    const idx = p.indexOf('=');
    if (idx < 0) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k === name) return v;
  }
  return null;
}

export function buildCookieHeader(token, isSecure = true, maxAge = SESSION_TTL) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (isSecure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookieHeader(isSecure = true) {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecure) parts.push('Secure');
  return parts.join('; ');
}

export { COOKIE_NAME, SESSION_TTL };
