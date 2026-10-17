import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

export function writeFiles(root, files) {
  for (const [p, c] of Object.entries(files)) {
    const f = join(root, p);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, c);
  }
}

export function commit(root, msg = 'c') {
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false',
    'commit', '-q', '--allow-empty', '-m', msg], { cwd: root });
}

// Every scratch project is removed when the test process exits, so runs leave nothing in the temp folder.
const made = [];
process.on('exit', () => { for (const d of made) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

export function tmpDir(prefix = 'ownit-') {
  const d = mkdtempSync(join(tmpdir(), prefix));
  made.push(d);
  return d;
}

export function tmpProject(files = {}, { git = true, commitFiles = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ownit-'));
  made.push(root);
  writeFiles(root, files);
  if (git) {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root });
    if (commitFiles) commit(root, 'init');
  }
  return root;
}

export function ctx(root, extra = {}) {
  return { root, now: () => new Date('2026-10-13T16:00:00Z'), env: {}, ...extra };
}
