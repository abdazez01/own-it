import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openCommand } from '../own-it/scripts/lib/cmd-open.mjs';
import { SKILL_DIR } from '../own-it/scripts/lib/paths.mjs';
import { tmpProject } from './helpers.mjs';

const CLI = join(SKILL_DIR, 'scripts', 'own-it.mjs');
const run = (root, ...args) => spawnSync(process.execPath, [CLI, ...args],
  { encoding: 'utf8', env: { ...process.env, OWNIT_ROOT: root, OWNIT_NO_OPEN: '1' } });

test('openCommand per platform', () => {
  assert.deepEqual(openCommand('win32', 'C:/p/g.html'), { cmd: 'cmd', args: ['/c', 'start', '""', 'C:/p/g.html'] });
  assert.deepEqual(openCommand('darwin', '/p/g.html'), { cmd: 'open', args: ['/p/g.html'] });
  assert.deepEqual(openCommand('linux', '/p/g.html'), { cmd: 'xdg-open', args: ['/p/g.html'] });
});

test('CLI end to end: init, scan, fog, open print one JSON line each', () => {
  const root = tmpProject({ 'package.json': '{"dependencies":{"express":"4"}}', 'api/a.js': "app.get('/x', h);\n" });
  writeFileSync(join(root, 'zones.json'), JSON.stringify({ zones: [{ id: 'api', name: 'API', paths: ['api'] }] }));
  for (const args of [['init', '--zones', join(root, 'zones.json')], ['scan'], ['fog'], ['open']]) {
    const r = run(root, ...args);
    assert.equal(r.status, 0, `${args[0]}: ${r.stderr}`);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines.length, 1, args[0]);
    JSON.parse(lines[0]);
  }
});

test('CLI open before init fails cleanly', () => {
  const r = run(tmpProject({}), 'open');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /own-it: game page missing; run init first/);
});

test('open accepts only a local serve URL', async () => {
  const { isLocalUrl, run: openRun } = await import('../own-it/scripts/lib/cmd-open.mjs');
  assert.equal(openCommand('linux', 'http://127.0.0.1:5000/game.html?t=ab').args[0], 'http://127.0.0.1:5000/game.html?t=ab');
  assert.ok(isLocalUrl('http://127.0.0.1:5000/game.html?t=abc123'));
  assert.ok(isLocalUrl('http://localhost:5000/game.html'));
  for (const bad of ['https://127.0.0.1:5000/', 'http://example.com:80/', 'http://127.0.0.1/', 'http://127.0.0.1:5000@evil.com/', 'http://127.0.0.1:5000/&calc', 'file:///etc/passwd', 'nope'])
    assert.equal(isLocalUrl(bad), false, bad);
  const ctx = { root: tmpProject({}), env: { OWNIT_NO_OPEN: '1' } };
  assert.deepEqual(await openRun({ _: ['http://127.0.0.1:5000/game.html?t=ab'], flags: {} }, ctx), { opened: 'http://127.0.0.1:5000/game.html?t=ab' });
  await assert.rejects(openRun({ _: ['http://evil.com:80/'], flags: {} }, ctx), /127\.0\.0\.1/);
});
