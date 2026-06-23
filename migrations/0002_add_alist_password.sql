-- 0002: 视频表新增 alist_password 字段
-- 用于访问设了访问密码的 alist 目录（非全局登录态，仅目录级密码）
-- 全局账号 token 走环境变量 ALIST_TOKEN，不入库

ALTER TABLE videos ADD COLUMN alist_password TEXT;
