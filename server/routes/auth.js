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
  if (token && secret) {
    const data = await verifyToken(token, secret);
    authenticated = !!data;
  }
  return c.json({ authenticated });
});

/* POST /api/auth/login { password } */
auth.post('/login', async (c) => {
  const secret = c.env.SESSION_SECRET;
  const adminPassword = c.env.ADMIN_PASSWORD;
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
  if (!timingSafeEqual(password, adminPassword)) {
    return c.json({ error: '密码错误' }, 401);
  }
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const token = await signToken(exp, secret);
  c.header('Set-Cookie', buildCookieHeader(token, isSecureReq(c), SESSION_TTL));
  return c.json({ ok: true });
});

/* POST /api/auth/logout */
auth.post('/logout', (c) => {
  c.header('Set-Cookie', clearCookieHeader(isSecureReq(c)));
  return c.json({ ok: true });
});

export default auth;
