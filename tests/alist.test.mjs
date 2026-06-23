import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAlistBase,
  getConfiguredAlistOrigin,
  isVideoName,
  joinAlistUrl,
  normalizeAlistFileUrl,
  VIDEO_URL_EXT,
} from '../server/utils/alist.js';

test('detects supported video filenames', () => {
  assert.equal(isVideoName('training.MP4'), true);
  assert.equal(isVideoName('clip.mkv'), true);
  assert.equal(isVideoName('cover.jpg'), false);
  assert.equal(isVideoName('folder'), false);
});

test('detects supported video URL paths', () => {
  assert.equal(VIDEO_URL_EXT.test('/media/workout.mp4'), true);
  assert.equal(VIDEO_URL_EXT.test('/media/workout.mp4?sign=abc'), true);
  assert.equal(VIDEO_URL_EXT.test('/media/workout.jpg'), false);
});

test('normalizes configured Alist base', () => {
  assert.equal(getAlistBase({ ALIST_BASE: 'https://alist.example.com/root/' }), 'https://alist.example.com');
  assert.equal(getAlistBase({ ALIST_BASE: '' }), '');
  assert.equal(getAlistBase({ ALIST_BASE: 'not a url' }), null);
});

test('reads configured Alist origin for play restrictions', () => {
  assert.equal(getConfiguredAlistOrigin({ ALIST_BASE: 'https://alist.example.com/root/' }), 'https://alist.example.com');
  assert.equal(getConfiguredAlistOrigin({ ALIST_BASE: '' }), null);
  assert.equal(getConfiguredAlistOrigin({ ALIST_BASE: 'not a url' }), '');
});

test('joins Alist base with relative paths only', () => {
  assert.equal(joinAlistUrl('https://alist.example.com', '/videos/a.mp4'), 'https://alist.example.com/videos/a.mp4');
  assert.equal(joinAlistUrl('https://alist.example.com/', 'videos/a.mp4'), 'https://alist.example.com/videos/a.mp4');
  assert.equal(joinAlistUrl('https://alist.example.com', 'https://cdn.example.com/a.mp4'), 'https://cdn.example.com/a.mp4');
});

test('normalizes Alist file URLs before import', () => {
  assert.deepEqual(
    normalizeAlistFileUrl('https://alist.example.com', '/videos/a.mp4'),
    { ok: true, url: 'https://alist.example.com/videos/a.mp4' }
  );
  assert.deepEqual(
    normalizeAlistFileUrl('', '/videos/a.mp4'),
    { ok: false, error: '相对路径需要配置有效的 ALIST_BASE' }
  );
  assert.deepEqual(
    normalizeAlistFileUrl('https://alist.example.com', 'https://cdn.example.com/a.mp4'),
    { ok: true, url: 'https://cdn.example.com/a.mp4' }
  );
});
