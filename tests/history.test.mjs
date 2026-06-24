import assert from 'node:assert/strict';
import test from 'node:test';

import app from '../server/index.js';
import { COOKIE_NAME, signToken } from '../server/utils/token.js';

async function adminCookie() {
  const token = await signToken(Math.floor(Date.now() / 1000) + 3600, 'test-secret', 'admin');
  return `${COOKIE_NAME}=${token}`;
}

function createStatsDb(rows) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async all() {
              if (sql.includes('JOIN videos')) return { results: rows };
              if (sql.includes('SELECT DISTINCT started_at')) {
                return { results: rows.map((r) => ({ started_at: r.started_at })) };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

test('history monthly total counts incomplete sessions by watched progress', async () => {
  const completedAt = Date.UTC(2026, 5, 22, 12, 0, 0) / 1000;
  const partialAt = Date.UTC(2026, 5, 23, 12, 0, 0) / 1000;
  const db = createStatsDb([
    {
      started_at: completedAt,
      last_watch_at: completedAt + 1556,
      progress: 1556,
      duration: 1556,
      completed: 1,
      video_id: 1,
      video_title: 'Completed video',
    },
    {
      started_at: partialAt,
      last_watch_at: partialAt + 14,
      progress: 14,
      duration: 1556,
      completed: 0,
      video_id: 1,
      video_title: 'Partial video',
    },
  ]);

  const res = await app.request(
    '/api/history/stats?month=2026-06',
    { headers: { Cookie: await adminCookie(), 'X-Timezone-Offset': '0' } },
    { SESSION_SECRET: 'test-secret', DB: db }
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.month_total_seconds, 1570);
  assert.equal(body.stats.find((d) => d.date === '2026-06-23').total_seconds, 14);
  assert.equal(body.stats.find((d) => d.date === '2026-06-22').total_seconds, 1556);
});