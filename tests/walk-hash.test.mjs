import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { listFiles } from '../own-it/scripts/lib/walk.mjs';
import { blobHash, hashesFor, lineCount } from '../own-it/scripts/lib/hash.mjs';
import { tmpProject, writeFiles, commit } from './helpers.mjs';

test('listFiles skips ignored dirs, binaries, lockfiles, big files', () => {
  const root = tmpProject({
    'src/a.ts': 'x', 'src/b.png': 'x', 'node_modules/m/i.js': 'x', '.own-it/p.json': '{}',
    'package-lock.json': '{}', 'big.txt': 'a'.repeat(600 * 1024), 'docs/readme.md': 'hi',
  }, { git: false });
  assert.deepEqual(listFiles(root), ['docs/readme.md', 'src/a.ts']);
});

test('blobHash equals git hash-object', () => {
  const root = tmpProject({ 'f.txt': 'hello\nworld\n' }, { git: false });
  const git = execFileSync('git', ['hash-object', join(root, 'f.txt')], { encoding: 'utf8' }).trim();
  assert.equal(blobHash('hello\nworld\n'), git);
});

test('hashesFor uses committed blobs and ignores uncommitted edits', () => {
  const root = tmpProject({ 'a.js': 'one\n' });
  const before = hashesFor(root, ['a.js', 'nope.js']);
  assert.equal(before.git, true);
  assert.equal(before.hashes['a.js'], blobHash('one\n'));
  assert.equal(before.hashes['nope.js'], null);
  writeFiles(root, { 'a.js': 'two\n' });
  assert.equal(hashesFor(root, ['a.js']).hashes['a.js'], blobHash('one\n'));
  commit(root, 'edit');
  assert.equal(hashesFor(root, ['a.js']).hashes['a.js'], blobHash('two\n'));
});

test('hashesFor without git or without commits falls back to content hash', () => {
  const noGit = tmpProject({ 'a.js': 'x\n' }, { git: false });
  assert.deepEqual(hashesFor(noGit, ['a.js']), { git: false, hashes: { 'a.js': blobHash('x\n') } });
  const noCommit = tmpProject({ 'a.js': 'x\n' }, { git: true, commitFiles: false });
  assert.equal(hashesFor(noCommit, ['a.js']).git, false);
});

test('lineCount handles CRLF, no trailing newline, missing file', () => {
  const root = tmpProject({ 'crlf.txt': 'a\r\nb\r\nc', 'lf.txt': 'a\nb\n' }, { git: false });
  assert.equal(lineCount(root, 'crlf.txt'), 3);
  assert.equal(lineCount(root, 'lf.txt'), 2);
  assert.equal(lineCount(root, 'missing.txt'), 0);
});
