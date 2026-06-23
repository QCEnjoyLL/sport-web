-- 0004: 创建 series 表，存储系列元数据（封面图、描述、排序）
CREATE TABLE IF NOT EXISTS series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  cover TEXT,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 从现有视频的 series 字段自动导入系列记录
INSERT OR IGNORE INTO series (name, cover, description, sort_order, created_at, updated_at)
SELECT DISTINCT v.series, NULL, NULL, 0, strftime('%s', 'now'), strftime('%s', 'now')
FROM videos v
WHERE v.series IS NOT NULL AND v.series != '';
