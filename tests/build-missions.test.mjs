import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { run as init } from '../own-it/scripts/lib/cmd-init.mjs';
import { run as build } from '../own-it/scripts/lib/cmd-build-missions.mjs';
import { loadModel, saveModel } from '../own-it/scripts/lib/model.mjs';
import { loadProgress, saveProgress } from '../own-it/scripts/lib/progress.mjs';
import core from '../own-it/scripts/lib/core.mjs';
import { tmpProject, ctx } from './helpers.mjs';

const I = (o) => ({ conf: 'high', ref: 'api/t.ts:1', ...o });
async function setup() {
  const root = tmpProject({ 'api/t.ts': 'x\n' });
  writeFileSync(join(root, 'zones.json'), JSON.stringify({ zones: [{ id: 'trips', name: 'Trips', paths: ['api'] }] }));
  await init({ _: [], flags: { zones: join(root, 'zones.json') } }, ctx(root));
  const m = loadModel(root);
  m.zones.trips.items = [
    I({ id: 'c0', k: 'surface', label: 'Trip screen', actor: 'Driver app' }),
    I({ id: 'c1', k: 'surface', label: 'POST cancel', actor: 'Backend' }),
    I({ id: 'c3', k: 'surface', label: 'Approvals', actor: 'Manager portal' }),
    I({ id: 'c4', k: 'component', label: 'Trips table', actor: 'Backend' }),
    I({ id: 'e1', k: 'edge', from: 'c0', to: 'c1' }),
    I({ id: 'e2', k: 'edge', from: 'c1', to: 'c4' }),
    I({ id: 'e3', k: 'edge', from: 'c3', to: 'c1' }),
    I({ id: 'f1', k: 'flow', label: 'trip-cancel', steps: [['c0'], ['c1', 'c4'], ['c3']] }),
    I({ id: 'x1', k: 'failure', card: 'c1', threat: 'double request' }),
  ];
  saveModel(root, m);
  return root;
}
function open(root, ...rungs) {
  const p = loadProgress(root);
  for (const r of rungs) p.zones.trips.rungs[r] = 'open';
  saveProgress(root, p);
}
function recipe(root, missions, mode = 'practice') {
  const p = join(root, 'recipe.json');
  writeFileSync(p, JSON.stringify({ mode, missions }));
  return p;
}
function loadMissions(root) {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(join(root, '.own-it', 'mission.js'), 'utf8'), sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.OWNIT_MISSIONS)); // detach from vm realm so deepEqual sees same prototypes
}

test('map mission expands cards and derives edges; answer is obfuscated', async () => {
  const root = await setup();
  open(root, 'map');
  const out = await build({ _: [recipe(root, [{ zone: 'trips', rung: 'map', board: 'component', brief: 'Map it', cards: ['c0', 'c1', 'c4'] }])], flags: {} }, ctx(root));
  assert.deepEqual(out.missions, ['trips-map-1']);
  const M = loadMissions(root);
  const m = M.missions[0];
  assert.deepEqual(m.cards.map((c) => c.id).sort(), ['c0', 'c1', 'c4']);
  assert.equal(m.cards[0].ref, 'api/t.ts:1');
  assert.doesNotMatch(readFileSync(join(root, '.own-it', 'mission.js'), 'utf8'), /"edges"/);
  assert.deepEqual(core.decode(m.answer), { edges: [{ id: 'e1', from: 'c0', to: 'c1' }, { id: 'e2', from: 'c1', to: 'c4' }] });
  assert.equal(loadProgress(root).seq, 1);
  const session = JSON.parse(readFileSync(join(root, '.own-it', 'session.json'), 'utf8'));
  assert.deepEqual(session.missions['trips-map-1'].cardIds, ['c0', 'c1', 'c4']);
});

test('trace mission builds lanes and grouped steps from flow', async () => {
  const root = await setup();
  open(root, 'trace');
  await build({ _: [recipe(root, [{ zone: 'trips', rung: 'trace', board: 'swimlanes', brief: 'Cancel', flow: 'f1',
    pins: [{ card: 'c3', q: 'Why approval?' }] }])], flags: {} }, ctx(root));
  const m = loadMissions(root).missions[0];
  assert.deepEqual(m.lanes, ['Driver app', 'Backend', 'Manager portal']);
  assert.deepEqual(core.decode(m.answer), { steps: [['c0'], ['c1', 'c4'], ['c3']],
    lanes: { c0: 'Driver app', c1: 'Backend', c4: 'Backend', c3: 'Manager portal' } });
});

test('break mission adds tokens; boss mission is blank with all cards', async () => {
  const root = await setup();
  open(root, 'break', 'boss');
  await build({ _: [recipe(root, [
    { zone: 'trips', rung: 'break', board: 'component', brief: 'Break', cards: ['c0', 'c1'], threats: ['x1'] },
    { zone: 'trips', rung: 'boss', board: 'component', brief: 'Defend' }])], flags: {} }, ctx(root));
  const [b, boss] = loadMissions(root).missions;
  assert.deepEqual(b.tokens, [{ id: 'x1', label: 'double request' }]);
  assert.deepEqual(core.decode(b.answer).threats, [{ id: 'x1', card: 'c1' }]);
  assert.equal(boss.blank, true);
  assert.equal(core.decode(boss.answer).cards.length, 4);
});

test('locked rung refused with what is left to clear; nothing written', async () => {
  const root = await setup();
  await assert.rejects(build({ _: [recipe(root, [{ zone: 'trips', rung: 'trace', board: 'swimlanes', brief: 'x', flow: 'f1' }])], flags: {} }, ctx(root)),
    /rung "trace" is locked in zone "trips"; map needs surfaces c0,c1,c3/);
  assert.equal(existsSync(join(root, '.own-it', 'mission.js')), false);
});

test('unknown ids, bad pins, bad recipe rejected', async () => {
  const root = await setup();
  open(root, 'map');
  await assert.rejects(build({ _: [recipe(root, [{ zone: 'trips', rung: 'map', board: 'component', brief: 'x', cards: ['c0', 'zz'] }])], flags: {} }, ctx(root)), /unknown ids in missions\[0\]: zz/);
  await assert.rejects(build({ _: [recipe(root, [{ zone: 'trips', rung: 'map', board: 'component', brief: 'x', cards: ['c0', 'c1'], pins: [{ card: 'c3', q: 'q' }] }])], flags: {} }, ctx(root)), /pin card "c3" not in missions\[0\] cards/);
  await assert.rejects(build({ _: [recipe(root, [{ zone: 'trips', rung: 'map', board: 'pie', brief: 'x' }])], flags: {} }, ctx(root)), /invalid recipe: missions\[0\]\.board/);
});

test('refresh mission requires fogged zone', async () => {
  const root = await setup();
  await assert.rejects(build({ _: [recipe(root, [{ zone: 'trips', rung: 'map', board: 'component', brief: 'x', cards: ['c0', 'c1'], refresh: true }])], flags: {} }, ctx(root)), /zone "trips" is not fogged/);
});

test('emitted cards omit actor, are shuffled deterministically, boss answer cards carry ref and conf', async () => {
  const flat = ['c0', 'c1', 'c4', 'c3'];
  const orders = [];
  for (let n = 0; n < 2; n++) {
    const root = await setup();
    open(root, 'trace', 'boss');
    await build({ _: [recipe(root, [
      { zone: 'trips', rung: 'trace', board: 'swimlanes', brief: 'Cancel', flow: 'f1' },
      { zone: 'trips', rung: 'boss', board: 'component', brief: 'Defend' }])], flags: {} }, ctx(root));
    const [t, boss] = loadMissions(root).missions;
    assert.ok(t.cards.every((c) => !('actor' in c)), 'no actor on cards');
    orders.push(t.cards.map((c) => c.id));
    assert.deepEqual([...orders[n]].sort(), [...flat].sort());
    const bc = core.decode(boss.answer).cards;
    assert.ok(bc.every((c) => c.ref === 'api/t.ts:1' && c.conf === 'high' && c.label), JSON.stringify(bc));
  }
  assert.notDeepEqual(orders[0], flat);
  assert.deepEqual(orders[0], orders[1]);
});
