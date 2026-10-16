import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from '../own-it/scripts/lib/args.mjs';
import { check, RECIPE, ITEM } from '../own-it/scripts/lib/validate.mjs';
import { readJson, writeJson, writeJsVar } from '../own-it/scripts/lib/json.mjs';
import { toPosix, downloadsDir, SKILL_DIR } from '../own-it/scripts/lib/paths.mjs';
import { estimate } from '../own-it/scripts/lib/tokens.mjs';
import { tmpProject } from './helpers.mjs';

const CLI = join(SKILL_DIR, 'scripts', 'own-it.mjs');

test('parseArgs handles positionals, valued flags, boolean flags, = form', () => {
  assert.deepEqual(parseArgs(['scan', '--strings', 'trips', '--git-tracked', '--x=1']),
    { _: ['scan'], flags: { strings: 'trips', 'git-tracked': true, x: '1' } });
});

test('check reports exact field paths', () => {
  const errs = check({ mode: 'casual', missions: [{ zone: 'z', rung: 'map', board: 'pie', brief: 'b' }] }, RECIPE);
  assert.ok(errs.includes('mode: expected one of practice,exam'), errs.join('\n'));
  assert.ok(errs.includes('missions[0].board: expected one of component,swimlanes'), errs.join('\n'));
});

test('check enforces string max', () => {
  const errs = check({ mode: 'practice', missions: [{ zone: 'z', rung: 'map', board: 'component', brief: 'x'.repeat(301) }] }, RECIPE);
  assert.ok(errs.includes('missions[0].brief: at most 300 chars'), errs.join('\n'));
});

test('check requires ref and conf on items', () => {
  const errs = check({ id: 'c1', k: 'surface', label: 'x' }, ITEM);
  assert.ok(errs.includes('ref: required'));
  assert.ok(errs.includes('conf: required'));
});

test('json helpers: atomic write, fallback, invalid json error, js var', () => {
  const root = tmpProject({}, { git: false });
  const p = join(root, 'a', 'b.json');
  assert.deepEqual(readJson(p, { d: 1 }), { d: 1 });
  writeJson(p, { x: 1 });
  assert.deepEqual(readJson(p), { x: 1 });
  assert.equal(existsSync(p + '.tmp'), false);
  writeJsVar(join(root, 'v.js'), 'OWNIT_X', { y: 2 });
  assert.equal(readFileSync(join(root, 'v.js'), 'utf8'), 'window.OWNIT_X = {"y":2};\n');
  const bad = join(root, 'bad.json');
  writeFileSync(bad, '{nope');
  assert.throws(() => readJson(bad), /invalid JSON/);
});

test('paths: toPosix and downloads dir precedence', () => {
  assert.equal(toPosix('api\\trips.ts'), 'api/trips.ts');
  assert.equal(downloadsDir('/custom', {}), '/custom');
  assert.equal(downloadsDir(null, { OWNIT_DOWNLOADS: '/env' }), '/env');
  assert.match(downloadsDir(null, {}), /Downloads$/);
});

test('estimate is chars/4 rounded up, objects stringified', () => {
  assert.equal(estimate('abcd', 'e'), 2);
  assert.equal(estimate({ a: 1 }), 2); // {"a":1} = 7 chars
});

test('CLI: unknown command exits 1 with own-it: prefix', () => {
  const r = spawnSync(process.execPath, [CLI, 'nope'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^own-it: unknown command "nope"/);
});

test('CLI: no command prints usage and exits 1', () => {
  const r = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: own-it <init\|scan\|check-refs\|fog\|build-missions\|collect\|apply\|open\|build-recs>/);
});
