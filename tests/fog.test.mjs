import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run as init } from '../own-it/scripts/lib/cmd-init.mjs';
import { run as checkRefs } from '../own-it/scripts/lib/cmd-check-refs.mjs';
import { run as fog } from '../own-it/scripts/lib/cmd-fog.mjs';
import { loadProgress, saveProgress } from '../own-it/scripts/lib/progress.mjs';
import { hashesFor } from '../own-it/scripts/lib/hash.mjs';
import { tmpProject, writeFiles, commit, ctx } from './helpers.mjs';

async function setup(opts) {
  const root = tmpProject({ 'api/trips.ts': 'a\nb\n', 'app/T.tsx': 'x\n' }, opts);
  writeFileSync(join(root, 'zones.json'), JSON.stringify({ zones: [{ id: 'trips', name: 'Trips', paths: ['api', 'app'] }] }));
  await init({ _: [], flags: { zones: join(root, 'zones.json') } }, ctx(root));
  writeFileSync(join(root, 'ex.json'), JSON.stringify({ zone: 'trips', files: ['api/trips.ts', 'app/T.tsx'], items: [
    { id: 'c1', k: 'surface', label: 'api', ref: 'api/trips.ts:1', conf: 'high' }] }));
  await checkRefs({ _: [join(root, 'ex.json')], flags: {} }, ctx(root));
  return root;
}

function claimMap(root) {
  const p = loadProgress(root);
  p.zones.trips.rungs.words = 'cleared';
  p.zones.trips.rungs.map = 'cleared';
  p.zones.trips.rungs.trace = 'open';
  p.zones.trips.claimHashes.map = hashesFor(root, ['api/trips.ts', 'app/T.tsx']).hashes;
  saveProgress(root, p);
}

test('clean zone: no fog, no stale, rung string', async () => {
  const root = await setup();
  claimMap(root);
  const out = await fog({ _: [], flags: {} }, ctx(root));
  assert.equal(out.git, true);
  assert.deepEqual(out.zones, [{ id: 'trips', name: 'Trips', rungs: 'cco--', fogged: false, stale: [] }]);
});

test('uncommitted edit does not fog; committed edit fogs and marks stale', async () => {
  const root = await setup();
  claimMap(root);
  writeFiles(root, { 'api/trips.ts': 'changed\n' });
  assert.equal((await fog({ _: [], flags: {} }, ctx(root))).zones[0].fogged, false);
  commit(root, 'change');
  const out = await fog({ _: [], flags: {} }, ctx(root));
  assert.equal(out.zones[0].fogged, true);
  assert.deepEqual(out.zones[0].stale, ['api/trips.ts']);
  assert.equal(loadProgress(root).zones.trips.fogged, true);
});

test('new committed file in zone is stale', async () => {
  const root = await setup();
  writeFiles(root, { 'app/New.tsx': 'n\n' });
  commit(root, 'new');
  assert.deepEqual((await fog({ _: [], flags: {} }, ctx(root))).zones[0].stale, ['app/New.tsx']);
});

test('non-git project: git false, never fogged, stale by content', async () => {
  const root = await setup({ git: false });
  claimMap(root);
  writeFiles(root, { 'api/trips.ts': 'changed\n' });
  const out = await fog({ _: [], flags: {} }, ctx(root));
  assert.equal(out.git, false);
  assert.equal(out.zones[0].fogged, false);
  assert.deepEqual(out.zones[0].stale, ['api/trips.ts']);
});

test('zero zones in a non-git project: git false', async () => {
  const root = tmpProject({ 'a.txt': 'a\n' }, { git: false });
  const out = await fog({ _: [], flags: {} }, ctx(root));
  assert.equal(out.git, false);
  assert.deepEqual(out.zones, []);
});

test('fogged zone clears when hashes match again', async () => {
  const root = await setup();
  claimMap(root);
  writeFiles(root, { 'api/trips.ts': 'changed\n' });
  commit(root, 'change');
  assert.equal((await fog({ _: [], flags: {} }, ctx(root))).zones[0].fogged, true);
  writeFiles(root, { 'api/trips.ts': 'a\nb\n' });
  commit(root, 'revert');
  assert.equal((await fog({ _: [], flags: {} }, ctx(root))).zones[0].fogged, false);
  assert.equal(loadProgress(root).zones.trips.fogged, false);
});

test('stale list is capped at 20', async () => {
  const root = await setup();
  const many = {};
  for (let i = 0; i < 25; i++) many[`app/n${i}.tsx`] = `${i}\n`;
  writeFiles(root, many);
  commit(root, 'many');
  assert.equal((await fog({ _: [], flags: {} }, ctx(root))).zones[0].stale.length, 20);
});
