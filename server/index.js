/* PULSE 后端 —— Hono app 定义 */
import { Hono } from 'hono';
import authRoutes from './routes/auth.js';
import videoRoutes from './routes/videos.js';
import historyRoutes from './routes/history.js';
import playRoutes from './routes/play.js';
import alistRoutes from './routes/alist.js';
import seriesRoutes from './routes/series.js';
import { authMiddleware } from './middleware/auth.js';

const app = new Hono();

/* 全局错误处理
   生产环境只返回通用提示，避免泄露堆栈/路径等敏感信息；
   本地调试时设置 DEBUG=1 环境变量可查看详细错误 */
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  const isDebug = c.env.DEBUG === '1';
  const msg = isDebug ? `服务器错误: ${err.message || String(err)}` : '服务器内部错误';
  return c.json({ error: msg }, 500);
});

/* 健康检查 */
app.get('/api/health', (c) => c.json({ ok: true, service: 'pulse' }));

/* 认证路由：公开（status/login/logout） */
app.route('/api/auth', authRoutes);

/* 以下路由需登录 */
app.use('/api/videos/*', authMiddleware);
app.use('/api/history/*', authMiddleware);
app.use('/api/play/*', authMiddleware);
app.use('/api/alist/*', authMiddleware);
app.use('/api/series/*', authMiddleware);

app.route('/api/videos', videoRoutes);
app.route('/api/history', historyRoutes);
app.route('/api/play', playRoutes);
app.route('/api/alist', alistRoutes);
app.route('/api/series', seriesRoutes);

/* 404 */
app.notFound((c) => c.json({ error: '接口不存在' }, 404));

export default app;
