-- PULSE 每日训练 — 初始建表
-- 单用户模式，无 user_id；观看记录按"当日会话"组织。

CREATE TABLE IF NOT EXISTS videos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    url         TEXT NOT NULL,
    cover       TEXT,
    description TEXT,
    duration    INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_videos_sort ON videos(sort_order DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS watch_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id       INTEGER NOT NULL,
    started_at     INTEGER NOT NULL DEFAULT (unixepoch()),
    last_watch_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    progress       INTEGER NOT NULL DEFAULT 0,
    duration       INTEGER NOT NULL DEFAULT 0,
    completed      INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_history_video  ON watch_history(video_id);
CREATE INDEX IF NOT EXISTS idx_history_started ON watch_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_done    ON watch_history(completed);
