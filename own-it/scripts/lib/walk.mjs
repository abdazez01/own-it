import { readdirSync, statSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';
import { toPosix } from './paths.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git', '.own-it', 'dist', 'build', 'out', 'coverage',
  'vendor', 'venv', '.venv', '__pycache__', '.next', '.nuxt', 'target', '.idea', '.vscode']);
const BINARY_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg', 'pdf', 'zip', 'gz', 'tar',
  'mp4', 'mp3', 'woff', 'woff2', 'ttf', 'eot', 'lock', 'exe', 'dll', 'so', 'dylib', 'class', 'jar', 'bin']);
const LOCK_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);
const MAX_SIZE = 512 * 1024;

export function isBinaryPath(p) {
  const name = basename(toPosix(p));
  if (LOCK_FILES.has(name)) return true;
  return BINARY_EXTS.has(extname(name).slice(1).toLowerCase());
}

export function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p);
      } else if (e.isFile()) {
        if (isBinaryPath(e.name)) continue;
        if (statSync(p).size > MAX_SIZE) continue;
        out.push(toPosix(relative(root, p)));
      }
    }
  };
  walk(root);
  return out.sort();
}
