import assert from 'node:assert/strict';
import test from 'node:test';

import app from '../server/index.js';
import { COOKIE_NAME, signToken } from '../server/utils/token.js';

async function guestCookie() {
  const token = await signToken(Math.floor(Date.now() / 1000) + 3600, 'test-secret', 'guest');
  return `${COOKIE_NAME}=${token}`;
}

function createDb() {
  let wrote = false;
  return {
    get wrote() {
      return wrote;
    },
    prepare(sql) {
      async function all() {
        if (sql.includes('FROM videos v')) {
          return {
            results: [
              {
                id: 1,
                title: 'Private OpenList Video',
                url: 'https://openlist.example.com/d/private/video.mp4',
                cover: '',
                series_cover: 'https://cdn.example.com/series.jpg',
                description: '',
                duration: 600,
                sort_order: 0,
                series: 'Series',
                episode: 1,
                alist_password: 'secret',
                created_at: 1,
                updated_at: 1,
                last_progress: 300,
                completed: 1,
                last_watched_at: 100,
              },
            ],
          };
        }
        return { results: [] };
      }
      return {
        bind() {
          return {
            all,
            async first() {
              return null;
            },
            async run() {
              wrote = true;
              return { success: true };
            },
          };
        },
        async run() {
          wrote = true;
          return { success: true };
        },
        all,
      };
    },
  };
}

test('auth status exposes the default guest password', async () => {
  const res = await app.request('/api/auth/status', {}, { SESSION_SECRET: 'test-secret' });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.guest_enabled, true);
  assert.equal(body.guest_password, 'guest');
});

test('guest video list hides source URLs and training progress', async () => {
  const db = createDb();
  const res = await app.request(
    '/api/videos',
    { headers: { Cookie: await guestCookie() } },
    { SESSION_SECRET: 'test-secret', DB: db }
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.videos[0].url, '');
  assert.equal(body.videos[0].has_password, 0);
  assert.equal(body.videos[0].last_progress, 0);
  assert.equal(body.videos[0].completed, 0);
  assert.equal(body.videos[0].last_watched_at, null);
});

test('guest history writes are accepted without touching the database', async () => {
  const db = createDb();
  const res = await app.request(
    '/api/history',
    {
      method: 'POST',
      headers: { Cookie: await guestCookie(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: 1, progress: 120, duration: 600 }),
    },
    { SESSION_SECRET: 'test-secret', DB: db }
  );

  assert.equal(res.status, 200);
  assert.equal(db.wrote, false);
  const body = await res.json();
  assert.equal(body.history.guest, true);
});

test('guest cannot mutate videos', async () => {
  const db = createDb();
  const res = await app.request(
    '/api/videos',
    {
      method: 'POST',
      headers: { Cookie: await guestCookie(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New video', url: 'https://cdn.example.com/video.mp4' }),
    },
    { SESSION_SECRET: 'test-secret', DB: db }
  );

  assert.equal(res.status, 403);
  assert.equal(db.wrote, false);
});

test('guest cannot use OpenList browse APIs', async () => {
  const res = await app.request(
    '/api/alist/browse',
    {
      method: 'POST',
      headers: { Cookie: await guestCookie(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/' }),
    },
    { SESSION_SECRET: 'test-secret', DB: createDb() }
  );

  assert.equal(res.status, 403);
});
