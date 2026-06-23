/* 认证中间件：校验 session cookie */
import { parseCookie, verifyToken, COOKIE_NAME } from '../utils/token.js';

export async function authMiddleware(c, next) {
  const cookie = c.req.header('cookie') || '';
  const token = parseCookie(cookie, COOKIE_NAME);
  const secret = c.env.SESSION_SECRET;
  if (!secret) {
    return c.json({ error: '服务器未配置密钥' }, 500);
  }
  const data = token ? await verifyToken(token, secret) : null;
  if (!data) {
    return c.json({ error: '未登录' }, 401);
  }
  c.set('session', data);
  await next();
}
