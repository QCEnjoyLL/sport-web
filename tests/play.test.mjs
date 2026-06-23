import assert from 'node:assert/strict';
import test from 'node:test';

import playRoutes from '../server/routes/play.js';

function createEnv(video) {
  return {
    ALIST_BASE: 'https://openlist.example.com',
    ALIST_TOKEN: '',
    SESSION_SECRET: 'test-secret',
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                return video;
              },
            };
          },
        };
      },
    },
  };
}

test('redirects non-OpenList video URLs directly', async (t) => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called for direct video URLs');
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const url = 'https://cdn.example.com/training/day-1.mp4?token=abc';
  const res = await playRoutes.request('/1', {}, createEnv({ url, alist_password: null }));

  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), url);
  assert.equal(fetchCalled, false);
});

test('refreshes sign for configured OpenList URLs', async (t) => {
  const originalFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return Response.json({
      code: 200,
      data: { sign: 'fresh-sign' },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const res = await playRoutes.request(
    '/1',
    {},
    createEnv({ url: 'https://openlist.example.com/d/videos/day-1.mp4', alist_password: null })
  );

  assert.equal(res.status, 302);
  assert.equal(requestBody.path, '/videos/day-1.mp4');
  assert.equal(res.headers.get('location'), 'https://openlist.example.com/d/videos/day-1.mp4?sign=fresh-sign');
});
