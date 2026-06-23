/* 认证路由：登录 / 登出 / 状态 */
import { Hono } from 'hono';
import {
  signToken,
  verifyToken,
  timingSafeEqual,
  parseCookie,
  buildCookieHeader,
  clearCookieHeader,
  COOKIE_NAME,
  SESSION_TTL,
} from '../utils/token.js';

const auth = new Hono();
const DEFAULT_GUEST_PASSWORD = 'guest';

/* 判断是否 https（生产 Cloudflare 一定是 https，本地 dev 是 http） */
function isSecureReq(c) {
  return (
    c.req.url.startsWith('https://') ||
    c.req.header('x-forwarded-proto') === 'https'
  );
}

/* GET /api/auth/status —— 公开，供前端判断登录态 */
auth.get('/status', async (c) => {
  const cookie = c.req.header('cookie') || '';
  const token = parseCookie(cookie, COOKIE_NAME);
  const secret = c.env.SESSION_SECRET;
  let authenticated = false;
  let role = null;
  if (token && secret) {
    const data = await verifyToken(token, secret);
    authenticated = !!data;
    role = data?.role || null;
  }
  const guestPassword = (c.env.GUEST_PASSWORD || DEFAULT_GUEST_PASSWORD).trim();
  return c.json({
    authenticated,
    role,
    guest_enabled: !!guestPassword,
    guest_password: guestPassword,
  });
});

/* POST /api/auth/login { password } */
auth.post('/login', async (c) => {
  const secret = c.env.SESSION_SECRET;
  const adminPassword = c.env.ADMIN_PASSWORD;
  const guestPassword = (c.env.GUEST_PASSWORD || DEFAULT_GUEST_PASSWORD).trim();
  if (!secret || !adminPassword) {
    return c.json({ error: '服务器未配置认证' }, 500);
  }
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: '请求格式错误' }, 400);
  }
  const password = typeof body === 'object' && body ? body.password : '';
  if (typeof password !== 'string' || password.length === 0) {
    return c.json({ error: '请输入密码' }, 400);
  }
  let role = null;
  if (timingSafeEqual(password, adminPassword)) {
    role = 'admin';
  } else if (guestPassword && timingSafeEqual(password, guestPassword)) {
    role = 'guest';
  }
  if (!role) {
    return c.json({ error: '密码错误' }, 401);
  }
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const token = await signToken(exp, secret, role);
  c.header('Set-Cookie', buildCookieHeader(token, isSecureReq(c), SESSION_TTL));
  return c.json({ ok: true, role });
});

/* POST /api/auth/logout */
auth.post('/logout', (c) => {
  c.header('Set-Cookie', clearCookieHeader(isSecureReq(c)));
  return c.json({ ok: true });
});

export default auth;
