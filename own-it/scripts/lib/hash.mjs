import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

export function blobHash(content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

function committed(root) {
  try {
    const out = execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    const prefix = execFileSync('git', ['rev-parse', '--show-prefix'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const map = new Map();
    for (const entry of out.split('\0')) {
      const m = entry.match(/^\d+ blob ([0-9a-f]+)\t([\s\S]+)$/);
      if (m && m[2].startsWith(prefix)) map.set(m[2].slice(prefix.length), m[1]);
    }
    return map;
  } catch { return null; }
}

export function hashesFor(root, files) {
  const map = committed(root);
  const hashes = {};
  for (const f of files) {
    if (map) hashes[f] = map.get(f) ?? null;
    else { const p = join(root, f); hashes[f] = existsSync(p) ? blobHash(readFileSync(p)) : null; }
  }
  return { git: !!map, hashes };
}

export function lineCount(root, file) {
  const p = join(root, file);
  if (!existsSync(p)) return 0;
  const s = readFileSync(p, 'utf8');
  if (s === '') return 0;
  const n = s.split(/\r?\n/).length;
  return /\r?\n$/.test(s) ? n - 1 : n;
}
