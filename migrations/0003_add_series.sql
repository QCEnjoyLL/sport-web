-- 0003: 视频表新增 series 和 episode 字段
-- series: 系列名称（可空），同名的视频归为同一个系列
-- episode: 集数（默认0），系列内按集数自然排序，解决 1/10/2 的字符串排序问题

ALTER TABLE videos ADD COLUMN series TEXT;
ALTER TABLE videos ADD COLUMN episode INTEGER NOT NULL DEFAULT 0;

-- 更新索引：优先按系列分组，系列内按集数排序
CREATE INDEX IF NOT EXISTS idx_videos_series ON videos(series ASC, episode ASC, sort_order DESC, created_at DESC);
