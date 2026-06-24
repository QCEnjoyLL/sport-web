import assert from 'node:assert/strict';
import test from 'node:test';

import {
  basenameFromVideoUrl,
  chooseFrameSecond,
  matchLocalFiles,
  normalizeVideoName,
} from '../scripts/generate-covers.mjs';

test('normalizes local video names for matching', () => {
  assert.equal(
    normalizeVideoName('DAY01饮食-如何生活化减脂？.mp4'),
    normalizeVideoName('day01饮食 如何生活化减脂')
  );
});

test('extracts decoded file names from video URLs', () => {
  assert.equal(
    basenameFromVideoUrl('https://example.com/d/DAY02%E8%BF%90%E5%8A%A8-%E8%85%B9%E8%82%A9.mp4?sign=abc'),
    'DAY02运动-腹肩.mp4'
  );
});

test('matches local files by title and URL basename', () => {
  const files = [
    { name: 'DAY01饮食-如何生活化减脂？.mp4', stem: 'DAY01饮食-如何生活化减脂？', path: 'D:/v/DAY01饮食-如何生活化减脂？.mp4' },
    { name: 'DAY02运动-腹肩特训燃脂.mp4', stem: 'DAY02运动-腹肩特训燃脂', path: 'D:/v/DAY02运动-腹肩特训燃脂.mp4' },
  ];
  const videos = [
    { id: 1, title: 'DAY01饮食-如何生活化减脂？', url: 'https://cdn.example.com/other.mp4', cover: '' },
    { id: 2, title: '不同标题', url: 'https://cdn.example.com/DAY02%E8%BF%90%E5%8A%A8-%E8%85%B9%E8%82%A9%E7%89%B9%E8%AE%AD%E7%87%83%E8%84%82.mp4', cover: '' },
  ];

  const result = matchLocalFiles(files, videos);
  assert.equal(result.matches.length, 2);
  assert.deepEqual(result.matches.map((m) => m.video.id), [1, 2]);
  assert.deepEqual(result.matches.map((m) => m.by), ['title', 'url']);
});

test('skips videos with existing covers unless overwrite is enabled', () => {
  const files = [{ name: 'DAY01运动-全身燃脂.mp4', stem: 'DAY01运动-全身燃脂', path: 'D:/v/DAY01运动-全身燃脂.mp4' }];
  const videos = [{ id: 1, title: 'DAY01运动-全身燃脂', url: '', cover: '/cover.jpg' }];

  assert.equal(matchLocalFiles(files, videos).matches.length, 0);
  assert.equal(matchLocalFiles(files, videos, { overwrite: true }).matches.length, 1);
});

test('chooses a frame away from black intros when duration is known', () => {
  assert.equal(chooseFrameSecond(1556), 124.48);
  assert.equal(chooseFrameSecond(10), 3.5);
  assert.equal(chooseFrameSecond(100, 12), 12);
});