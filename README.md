# PULSE 每日训练

PULSE 每日训练是一个部署在 Cloudflare Pages 上的私人运动跟练网站。它适合把 Alist / OpenList 里的训练视频整理成训练库，支持播放、续看、系列管理、训练记录和跨设备进度同步。

## 功能

- 单密码登录，使用签名 Cookie 保持 30 天会话
- 视频训练库：首页卡片、独立视频、系列视频
- 播放页：HTML5 video、续看提示、上下集导航、系列侧边栏
- 训练记录：自动保存进度、按天合并、月历统计、连续打卡
- 管理页：添加、编辑、删除、排序、批量管理视频
- Alist 集成：目录浏览、批量导入、目录访问密码、全局 token
- Cloudflare D1 存储，Pages Functions + Hono 后端
- 本地 Font Awesome 图标资源，无 cdnjs 依赖

## 技术栈

- 前端：原生 HTML / CSS / JavaScript
- 后端：Cloudflare Pages Functions + Hono
- 数据库：Cloudflare D1
- 认证：单用户密码 + HMAC-SHA256 session cookie
- 加密：Alist 目录密码使用 `SESSION_SECRET` 派生 AES-GCM 密钥加密存储
- 图标：本地 `@fortawesome/fontawesome-free@6.5.1`

## 目录结构

```text
sport-web/
├── public/                 # Pages 静态资源
│   ├── assets/             # CSS / JS / 图片 / 字体
│   ├── _headers            # Cloudflare Pages 响应头
│   └── *.html              # 页面
├── functions/api/          # Pages Functions 入口
├── server/                 # Hono 后端源码
│   ├── middleware/
│   ├── routes/
│   └── utils/
├── migrations/             # D1 数据库迁移
├── scripts/                # 项目检查脚本
├── tests/                  # Node 原生测试
├── wrangler.toml           # Cloudflare 配置
└── package.json
```

## 环境变量

本地开发使用 `.dev.vars`，生产环境使用 Cloudflare Pages Secrets。

```env
ADMIN_PASSWORD=your-login-password
SESSION_SECRET=random-long-secret
ALIST_BASE=https://alist.example.com
ALIST_TOKEN=optional-alist-token
```

说明：

- `ADMIN_PASSWORD`：网站登录密码，必填
- `SESSION_SECRET`：session 签名和目录密码加密密钥，必填
- `ALIST_BASE`：Alist / OpenList 地址，批量浏览和导入相对路径时需要
- `ALIST_TOKEN`：可选，用于访问需要登录账号的 Alist 私有资源

不要提交 `.dev.vars`、`.env`、token、密码或其它本地密钥。

## 本地开发

```bash
npm install
npm run db:init
npm run verify
npm run dev
```

默认本地地址通常是：

```text
http://localhost:8788
```

## 数据库迁移

本地 D1：

```bash
npm run db:migrate
```

远程 D1：

```bash
npm run db:migrate:remote
```

项目使用 `wrangler d1 migrations apply` 按顺序执行 `migrations/` 目录下的迁移。不要手动重复执行已经应用过的 `ALTER TABLE` 迁移。

## 部署

部署到 Cloudflare Pages：

```bash
npm run deploy
```

首次部署前需要：

1. 创建 D1 数据库并把 `database_id` 写入 `wrangler.toml`
2. 执行远程迁移：`npm run db:migrate:remote`
3. 在 Cloudflare Pages 项目中配置 Secrets：

```bash
npx wrangler pages secret put ADMIN_PASSWORD --project-name=sport-web
npx wrangler pages secret put SESSION_SECRET --project-name=sport-web
npx wrangler pages secret put ALIST_BASE --project-name=sport-web
npx wrangler pages secret put ALIST_TOKEN --project-name=sport-web
```

`ALIST_TOKEN` 可选；公开资源或只使用目录密码时可以不配置。

## 使用流程

1. 打开网站并输入访问密码
2. 进入管理页添加单个视频，或使用批量添加浏览 Alist 目录
3. 为视频设置系列、集数、封面、描述和排序
4. 在首页或系列页进入播放
5. 播放进度会自动记录，记录页可以查看训练月历和时间线

## Alist 资源说明

支持两类权限场景：

1. 目录访问密码：在添加或编辑视频时填写“Alist 目录访问密码”
2. 账号登录资源：配置全局 `ALIST_TOKEN`

新保存的目录密码会加密后存入 D1。旧版本保存的明文密码仍兼容读取，重新保存后会变为密文。

配置了 `ALIST_BASE` 后，播放接口只接受同一域名下的视频链接，避免误存非预期地址后发生跨站跳转。批量添加也会用它把 Alist 相对路径拼成完整 URL。

## 快捷键

播放页支持：

- `Space`：播放 / 暂停
- `←` / `→`：快退 / 快进 5 秒
- `↑` / `↓`：音量增减

## 验证

```bash
npm run verify
```

该命令会执行：

- `npm run check`：检查项目内 JavaScript 语法
- `npm test`：运行 Node 原生测试

## 安全与隐私

- `.dev.vars`、`.env`、`.wrangler/`、`node_modules/` 已被 `.gitignore` 排除
- 登录使用 HttpOnly Cookie
- session token 使用 HMAC-SHA256 签名
- Alist 目录密码新写入时加密存储
- Pages `_headers` 配置了基础安全响应头
- Font Awesome 已本地化，页面不依赖 cdnjs

## License

Personal project. Add a license file before publishing for wider reuse.
