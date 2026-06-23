import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const ignoredDirs = new Set(['node_modules', '.wrangler']);

function collectJsFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        collectJsFiles(join(dir, entry.name), out);
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const files = collectJsFiles(root);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`Checked ${files.length} JavaScript files.`);
