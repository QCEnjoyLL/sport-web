#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const VIDEO_EXT_RE = /\.(mp4|mkv|mov|m4v|webm)$/i;
const DEFAULT_ORIGIN = 'http://localhost:8788';

export function normalizeVideoName(input) {
  return String(input || '')
    .normalize('NFKC')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

export function basenameFromVideoUrl(input) {
  if (!input) return '';
  try {
    const u = new URL(input);
    const name = path.posix.basename(u.pathname);
    return decodeURIComponent(name);
  } catch {
    const clean = String(input).split(/[?#]/, 1)[0];
    return path.basename(clean);
  }
}

export function chooseFrameSecond(duration, requested) {
  if (Number.isFinite(requested) && requested > 0) return requested;
  if (!Number.isFinite(duration) || duration <= 0) return 8;
  if (duration <= 3) return Math.max(0.2, duration * 0.5);
  if (duration <= 15) return Math.max(1, duration * 0.35);
  return Math.min(Math.max(8, duration * 0.08), duration * 0.3, Math.max(1, duration - 1));
}

function stableHash(text, len = 8) {
  return createHash('sha1').update(String(text)).digest('hex').slice(0, len);
}

function coverTypeFromName(name) {
  if (name.includes('饮食')) return 'diet';
  if (name.includes('运动')) return 'workout';
  if (name.includes('呼吸')) return 'breath';
  return 'cover';
}

function dayPrefixFromName(name) {
  const m = String(name).match(/day\s*0*\d+/i);
  return m ? m[0].replace(/\s+/g, '').toLowerCase() : 'video';
}

function toPosixPath(p) {
  return p.split(path.sep).join('/');
}

function fileExists(file) {
  return access(file).then(() => true).catch(() => false);
}

function usage() {
  return `Usage:
  npm run covers -- --source "D:\\videos" --origin https://pulse.nloln.cn
  npm run covers -- --source "D:\\videos" --origin https://pulse.nloln.cn --generate --write

Options:
  --source <dir>       Local video directory. First positional arg also works.
  --origin <url>       Site origin. Defaults to SPORT_WEB_ORIGIN or ${DEFAULT_ORIGIN}.
  --password <value>   Admin password. Prefer SPORT_WEB_ADMIN_PASSWORD env var.
  --generate           Generate cover images with ffmpeg.
  --write              Update matched video cover fields through the admin API.
  --dry-run            Match only. This is the default when neither --generate nor --write is set.
  --overwrite          Include and update videos that already have a database cover.
  --regenerate         Recreate existing local cover files. This accesses videos again.
  --fuzzy              Allow conservative contains-based matching when exact matching fails.
  --out <dir>          Output dir. Defaults to public/assets/covers/generated.
  --at <seconds>       Fixed screenshot timestamp. Default picks a useful point automatically.
  --width <px>         Cover width. Defaults to 720.
  --quality <n>        JPEG q:v value. Defaults to 4.
  --ffmpeg <path>      ffmpeg executable. Defaults to ffmpeg.
  --ffprobe <path>     ffprobe executable. Defaults to ffprobe.
  --report <file>      Write JSON report.
  --max <n>            Limit generated/imported matches.
  --no-recursive       Do not scan subdirectories.
`;
}

export function parseArgs(argv) {
  const opts = {
    source: '',
    origin: process.env.SPORT_WEB_ORIGIN || DEFAULT_ORIGIN,
    password: process.env.SPORT_WEB_ADMIN_PASSWORD || '',
    out: 'public/assets/covers/generated',
    generate: false,
    write: false,
    dryRun: false,
    overwrite: false,
    regenerate: false,
    fuzzy: false,
    recursive: true,
    at: null,
    width: 720,
    quality: 4,
    ffmpeg: 'ffmpeg',
    ffprobe: 'ffprobe',
    report: '',
    max: Infinity,
    help: false,
  };

  const args = [...argv];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) throw new Error(`${arg} requires a value`);
      return args[i];
    };
    switch (arg) {
      case '--source': opts.source = next(); break;
      case '--origin': opts.origin = next(); break;
      case '--password': opts.password = next(); break;
      case '--out': opts.out = next(); break;
      case '--generate': opts.generate = true; break;
      case '--write': opts.write = true; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--overwrite': opts.overwrite = true; break;
      case '--regenerate': opts.regenerate = true; break;
      case '--fuzzy': opts.fuzzy = true; break;
      case '--no-recursive': opts.recursive = false; break;
      case '--at': opts.at = Number(next()); break;
      case '--width': opts.width = Math.max(160, Math.floor(Number(next()) || opts.width)); break;
      case '--quality': opts.quality = Math.max(2, Math.floor(Number(next()) || opts.quality)); break;
      case '--ffmpeg': opts.ffmpeg = next(); break;
      case '--ffprobe': opts.ffprobe = next(); break;
      case '--report': opts.report = next(); break;
      case '--max': opts.max = Math.max(1, Math.floor(Number(next()) || 1)); break;
      case '--help':
      case '-h': opts.help = true; break;
      default:
        if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
        if (!opts.source) opts.source = arg;
        else throw new Error(`Unexpected positional argument: ${arg}`);
    }
  }

  if (!opts.generate && !opts.write) opts.dryRun = true;
  opts.origin = String(opts.origin || DEFAULT_ORIGIN).replace(/\/+$/, '');
  return opts;
}

async function collectVideoFiles(dir, recursive, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) await collectVideoFiles(full, recursive, out);
      continue;
    }
    if (entry.isFile() && VIDEO_EXT_RE.test(entry.name)) {
      out.push({ path: full, name: entry.name, stem: path.parse(entry.name).name });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
}

function candidateScore(fileKey, video, fuzzy) {
  const titleKey = normalizeVideoName(video.title);
  const urlKey = normalizeVideoName(basenameFromVideoUrl(video.url));
  if (fileKey && titleKey && fileKey === titleKey) return { score: 100, by: 'title' };
  if (fileKey && urlKey && fileKey === urlKey) return { score: 95, by: 'url' };
  if (!fuzzy || !fileKey) return { score: 0, by: '' };

  const candidates = [
    { key: titleKey, by: 'title-fuzzy', score: 74 },
    { key: urlKey, by: 'url-fuzzy', score: 70 },
  ];
  for (const c of candidates) {
    if (!c.key) continue;
    const longer = Math.max(fileKey.length, c.key.length);
    const shorter = Math.min(fileKey.length, c.key.length);
    if (longer < 6) continue;
    if ((fileKey.includes(c.key) || c.key.includes(fileKey)) && shorter / longer >= 0.78) {
      return { score: c.score, by: c.by };
    }
  }
  return { score: 0, by: '' };
}

export function shouldGenerateCoverFile(exists, options = {}) {
  return !exists || !!options.regenerate;
}

export function matchLocalFiles(files, videos, options = {}) {
  const opts = { overwrite: false, fuzzy: false, ...options };
  const usableVideos = [];
  const skippedVideos = [];
  for (const video of videos) {
    if (!opts.overwrite && video.cover) skippedVideos.push(video);
    else usableVideos.push(video);
  }

  const matches = [];
  const ambiguous = [];
  const unmatched = [];
  const usedVideoIds = new Set();

  for (const file of files) {
    const fileKey = normalizeVideoName(file.stem || file.name);
    const candidates = usableVideos
      .filter((video) => !usedVideoIds.has(video.id))
      .map((video) => ({ video, ...candidateScore(fileKey, video, opts.fuzzy) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score || String(a.video.title).localeCompare(String(b.video.title), 'zh-CN'));

    const top = candidates[0];
    if (!top || top.score < (opts.fuzzy ? 70 : 95)) {
      unmatched.push({ file, candidates: candidates.slice(0, 5) });
      continue;
    }
    if (candidates[1] && candidates[1].score === top.score) {
      ambiguous.push({ file, candidates: candidates.filter((c) => c.score === top.score).slice(0, 5) });
      continue;
    }
    usedVideoIds.add(top.video.id);
    matches.push({ file, video: top.video, score: top.score, by: top.by });
  }

  const unmatchedVideos = usableVideos.filter((video) => !usedVideoIds.has(video.id));
  return { matches, ambiguous, unmatched, unmatchedVideos, skippedVideos };
}

function coverOutputFor(match, outDir) {
  const stem = match.file.stem || path.parse(match.file.name).name;
  const day = dayPrefixFromName(stem);
  const type = coverTypeFromName(stem);
  const hash = stableHash(`${match.video.id}:${stem}`);
  const filename = `video-${match.video.id}-${day}-${type}-${hash}.jpg`;
  return path.join(outDir, filename);
}

function coverUrlFor(outputFile) {
  const publicRoot = path.resolve('public');
  const resolved = path.resolve(outputFile);
  const rel = path.relative(publicRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Cover output must be inside public/ when using --write: ${outputFile}`);
  }
  return `/${toPosixPath(rel)}`;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with ${code}: ${stderr || stdout}`));
    });
  });
}

async function probeDuration(file, ffprobe) {
  try {
    const { stdout } = await runProcess(ffprobe, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file,
    ]);
    const duration = Number(stdout.trim());
    return Number.isFinite(duration) ? duration : 0;
  } catch {
    return 0;
  }
}

async function generateCover(inputFile, outputFile, opts) {
  await mkdir(path.dirname(outputFile), { recursive: true });
  const duration = await probeDuration(inputFile, opts.ffprobe);
  const second = chooseFrameSecond(duration, opts.at);
  await runProcess(opts.ffmpeg, [
    '-y',
    '-loglevel', 'error',
    '-ss', String(second),
    '-i', inputFile,
    '-frames:v', '1',
    '-vf', `scale=${opts.width}:-2`,
    '-q:v', String(opts.quality),
    outputFile,
  ]);
}

async function readJsonResponse(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

async function login(origin, password) {
  if (!password) {
    throw new Error('Missing admin password. Set SPORT_WEB_ADMIN_PASSWORD or pass --password.');
  }
  const res = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await readJsonResponse(res);
  if (!res.ok) throw new Error(`Login failed (${res.status}): ${data?.error || res.statusText}`);
  if (data?.role !== 'admin') throw new Error('The provided password logged in as non-admin. Use the admin password.');
  const cookies = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
  const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error('Login succeeded but no session cookie was returned.');
  return cookie;
}

async function apiJson(origin, cookie, pathName, options = {}) {
  const res = await fetch(`${origin}${pathName}`, {
    ...options,
    headers: {
      Cookie: cookie,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await readJsonResponse(res);
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${pathName} failed (${res.status}): ${data?.error || res.statusText}`);
  return data;
}

function summarize(report) {
  const lines = [
    `Local videos: ${report.localCount}`,
    `Remote videos considered: ${report.remoteConsidered}`,
    `Skipped remote videos with existing cover: ${report.skippedExistingCover}`,
    `Matched: ${report.matches.length}`,
    `Ambiguous: ${report.ambiguous.length}`,
    `Unmatched local files: ${report.unmatched.length}`,
    `Remote videos still unmatched: ${report.unmatchedVideos.length}`,
  ];
  return lines.join('\n');
}

function printExamples(report) {
  const shownMatches = report.matches.slice(0, 8);
  if (shownMatches.length) {
    console.log('\nMatched examples:');
    for (const m of shownMatches) console.log(`  [${m.by}] ${m.file.name} -> #${m.video.id} ${m.video.title}`);
  }
  if (report.ambiguous.length) {
    console.log('\nAmbiguous examples:');
    for (const item of report.ambiguous.slice(0, 5)) {
      console.log(`  ${item.file.name}`);
      for (const c of item.candidates) console.log(`    - #${c.video.id} ${c.video.title}`);
    }
  }
  if (report.unmatched.length) {
    console.log('\nUnmatched local examples:');
    for (const item of report.unmatched.slice(0, 10)) console.log(`  ${item.file.name}`);
  }
}

export async function run(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(usage());
    return { ok: true };
  }
  if (!opts.source) throw new Error('Missing --source <dir>.');

  const sourceStat = await stat(opts.source).catch(() => null);
  if (!sourceStat?.isDirectory()) throw new Error(`Source is not a directory: ${opts.source}`);

  const outDir = path.resolve(opts.out);
  const files = await collectVideoFiles(path.resolve(opts.source), opts.recursive);
  const cookie = await login(opts.origin, opts.password);
  const videoRes = await apiJson(opts.origin, cookie, '/api/videos');
  const videos = Array.isArray(videoRes?.videos) ? videoRes.videos : [];
  const result = matchLocalFiles(files, videos, opts);

  const matchesWithCovers = result.matches.map((m) => {
    const outputFile = coverOutputFor(m, outDir);
    return { ...m, outputFile, coverUrl: coverUrlFor(outputFile) };
  });

  const report = {
    origin: opts.origin,
    source: path.resolve(opts.source),
    out: outDir,
    dryRun: opts.dryRun,
    generate: opts.generate,
    write: opts.write,
    overwrite: opts.overwrite,
    regenerate: opts.regenerate,
    fuzzy: opts.fuzzy,
    localCount: files.length,
    remoteCount: videos.length,
    remoteConsidered: videos.length - result.skippedVideos.length,
    skippedExistingCover: result.skippedVideos.length,
    matches: matchesWithCovers,
    ambiguous: result.ambiguous,
    unmatched: result.unmatched,
    unmatchedVideos: result.unmatchedVideos,
  };

  console.log(summarize(report));
  printExamples(report);

  if (opts.report) {
    await writeFile(opts.report, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\nReport written: ${opts.report}`);
  }

  if (opts.dryRun) {
    console.log('\nDry run only. Add --generate to create covers and --write to import them.');
    return { ok: true, report };
  }

  const limitedMatches = matchesWithCovers.slice(0, opts.max);
  let generated = 0;
  let updated = 0;
  let missingGenerated = 0;
  let reused = 0;

  for (const match of limitedMatches) {
    if (opts.generate) {
      const exists = await fileExists(match.outputFile);
      if (shouldGenerateCoverFile(exists, opts)) {
        console.log(`Generating #${match.video.id}: ${match.coverUrl}`);
        await generateCover(match.file.path, match.outputFile, opts);
        generated += 1;
      } else {
        reused += 1;
        console.log(`Reusing existing cover #${match.video.id}: ${match.coverUrl}`);
      }
    }

    if (opts.write) {
      const exists = await fileExists(match.outputFile);
      if (!exists) {
        missingGenerated += 1;
        console.log(`Skip import, cover file does not exist: ${match.coverUrl}`);
        continue;
      }
      console.log(`Updating #${match.video.id}: ${match.coverUrl}`);
      await apiJson(opts.origin, cookie, `/api/videos/${match.video.id}`, {
        method: 'PUT',
        body: JSON.stringify({ cover: match.coverUrl }),
      });
      updated += 1;
    }
  }

  console.log(`\nDone. Generated: ${generated}, reused: ${reused}, updated: ${updated}, missing cover files: ${missingGenerated}.`);
  if (generated > 0) {
    console.log('Generated cover files are under public/. Commit them and deploy before relying on the imported cover URLs in production.');
  }
  return { ok: true, report, generated, reused, updated, missingGenerated };
}

if (process.argv[1] && path.basename(process.argv[1]) === 'generate-covers.mjs') {
  run().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}