import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run as init } from '../own-it/scripts/lib/cmd-init.mjs';
import { loadProgress } from '../own-it/scripts/lib/progress.mjs';
import { loadModel, saveModel } from '../own-it/scripts/lib/model.mjs';
import { tmpProject, ctx } from './helpers.mjs';

function zonesFile(root, zones) {
  const p = join(root, 'zones.json');
  writeFileSync(p, JSON.stringify({ zones }));
  return p;
}

test('init creates .own-it with self-ignoring .gitignore, model, progress, progress.js', async () => {
  const root = tmpProject({ 'api/trips.ts': '' });
  const out = await init({ _: [], flags: { zones: zonesFile(root, [{ id: 'trips', name: 'Trips', paths: ['api'] }]) } }, ctx(root));
  assert.deepEqual(out, { created: true, zones: ['trips'], gitTracked: false });
  assert.equal(readFileSync(join(root, '.own-it', '.gitignore'), 'utf8'), '*\n');
  assert.equal(existsSync(join(root, '.gitignore')), false);
  assert.equal(loadProgress(root).zones.trips.rungs.words, 'open');
  assert.equal(loadProgress(root).zones.trips.rungs.map, 'locked');
  assert.deepEqual(loadModel(root).zones.trips.paths, ['api']);
  assert.deepEqual(loadModel(root).zones.trips.files, {});
  assert.match(readFileSync(join(root, '.own-it', 'progress.js'), 'utf8'), /^window\.OWNIT_PROGRESS = /);
});

test('init --git-tracked removes the self-ignore', async () => {
  const root = tmpProject({});
  const zf = zonesFile(root, [{ id: 'a', name: 'A', paths: ['x'] }]);
  await init({ _: [], flags: { zones: zf } }, ctx(root));
  const out = await init({ _: [], flags: { zones: zf, 'git-tracked': true } }, ctx(root));
  assert.equal(out.gitTracked, true);
  assert.equal(existsSync(join(root, '.own-it', '.gitignore')), false);
  assert.equal(loadProgress(root).settings.gitTracked, true);
});

test('re-init merges zones: keeps items of kept zones, drops removed, adds new', async () => {
  const root = tmpProject({});
  await init({ _: [], flags: { zones: zonesFile(root, [{ id: 'a', name: 'A', paths: ['x'] }, { id: 'b', name: 'B', paths: ['y'] }]) } }, ctx(root));
  const m = loadModel(root);
  m.zones.a.items = [{ id: 'c1', k: 'surface', label: 'L', ref: 'x:1', conf: 'high' }];
  saveModel(root, m);
  const out = await init({ _: [], flags: { zones: zonesFile(root, [{ id: 'a', name: 'A2', paths: ['x', 'z'] }, { id: 'c', name: 'C', paths: ['w'] }]) } }, ctx(root));
  assert.equal(out.created, false);
  const m2 = loadModel(root);
  assert.deepEqual(Object.keys(m2.zones).sort(), ['a', 'c']);
  assert.equal(m2.zones.a.items.length, 1);
  assert.equal(m2.zones.a.name, 'A2');
  assert.deepEqual(Object.keys(loadProgress(root).zones).sort(), ['a', 'c']);
});

test('init rejects invalid zones file with field errors', async () => {
  const root = tmpProject({});
  await assert.rejects(init({ _: [], flags: { zones: zonesFile(root, [{ id: 'Bad Id', name: 'x', paths: [] }]) } }, ctx(root)),
    /invalid zones file: zones\[0\]\.id: does not match/);
});

test('init requires --zones', async () => {
  await assert.rejects(init({ _: [], flags: {} }, ctx(tmpProject({}))), /--zones <file> is required/);
});

test('init treats prototype-key ids as ordinary zone ids', async () => {
  const root = tmpProject({});
  const zf = zonesFile(root, [{ id: 'constructor', name: 'C', paths: ['x'] }]);
  const out = await init({ _: [], flags: { zones: zf } }, ctx(root));
  assert.deepEqual(out.zones, ['constructor']);
  assert.equal(loadProgress(root).zones.constructor.rungs.words, 'open');
  assert.deepEqual(loadModel(root).zones.constructor.items, []);
});

test('init rejects duplicate zone ids', async () => {
  const root = tmpProject({});
  const zf = zonesFile(root, [{ id: 'a', name: 'A', paths: ['x'] }, { id: 'a', name: 'B', paths: ['y'] }]);
  await assert.rejects(init({ _: [], flags: { zones: zf } }, ctx(root)), /invalid zones file: duplicate zone id "a"/);
});

test('init copies engine and registry', async () => {
  const root = tmpProject({});
  await init({ _: [], flags: { zones: zonesFile(root, [{ id: 'a', name: 'A', paths: ['x'] }]) } }, ctx(root));
  const base = join(root, '.own-it');
  for (const f of ['game.html', 'engine/shell.js', 'engine/home.js', 'engine/tokens.css', 'brand/mark.svg', 'brand/favicon.svg', 'games/quiz.meta.json']) {
    assert.ok(existsSync(join(base, f)), f);
  }
  const reg = readFileSync(join(base, 'games', 'registry.js'), 'utf8');
  assert.match(reg, /^window\.OWNIT_GAMES = \[/);
  const games = JSON.parse(reg.replace(/^window\.OWNIT_GAMES = /, '').replace(/;\s*$/, ''));
  assert.equal(games.length, 18);
  assert.ok(games.every((g) => g.logo.startsWith('<svg') && g.keys));
  assert.doesNotMatch(readFileSync(join(base, 'game.html'), 'utf8'), /prefers-color-scheme/);
});
