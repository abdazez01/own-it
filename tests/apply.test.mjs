import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run as init } from '../own-it/scripts/lib/cmd-init.mjs';
import { run as apply } from '../own-it/scripts/lib/cmd-apply.mjs';
import { loadModel, saveModel } from '../own-it/scripts/lib/model.mjs';
import { loadProgress, saveProgress } from '../own-it/scripts/lib/progress.mjs';
import { writeJson, readJson } from '../own-it/scripts/lib/json.mjs';
import { tmpProject, ctx } from './helpers.mjs';

const I = (o) => ({ conf: 'high', ref: 'api/t.ts:1', ...o });
async function setup() {
  const root = tmpProject({ 'api/t.ts': 'x\n' });
  writeFileSync(join(root, 'zones.json'), JSON.stringify({ zones: [{ id: 'trips', name: 'Trips', paths: ['api'] }] }));
  await init({ _: [], flags: { zones: join(root, 'zones.json') } }, ctx(root));
  const m = loadModel(root);
  m.zones.trips.items = [I({ id: 'c0', k: 'surface', label: 'a' }), I({ id: 'c1', k: 'surface', label: 'b' }),
    I({ id: 'c2', k: 'component', label: 'c' }), I({ id: 'e1', k: 'edge', from: 'c0', to: 'c1' })];
  saveModel(root, m);
  return root;
}
function mission(root, id, meta, answer, mode = 'practice') {
  const sp = join(root, '.own-it', 'session.json');
  const s = readJson(sp, { session: '2026-10-13T16:00:00.000Z', mode, missions: {} });
  s.mode = mode;
  s.missions[id] = { refresh: false, threatIds: [], ...meta };
  writeJson(sp, s);
  if (answer) writeJson(join(root, '.own-it', 'answers', `${id}.json`), { id, submittedAt: '2026-10-13T16:05:00.000Z', text: {}, hintsUsed: 0, challenges: [], missed: [], ...answer });
}
function setRungs(root, rungs) { const p = loadProgress(root); Object.assign(p.zones.trips.rungs, rungs); saveProgress(root, p); }

test('words mission via --got/--of clears words and opens map', async () => {
  const root = await setup();
  const out = await apply({ _: ['trips-words-1'], flags: { got: '8', of: '10' } }, ctx(root));
  assert.deepEqual(out.cleared, ['words']);
  assert.equal(out.xp, 80 + 50);
  assert.deepEqual(out.badges, ['first-word']);
  const p = loadProgress(root);
  assert.equal(p.zones.trips.rungs.words, 'cleared');
  assert.equal(p.zones.trips.rungs.map, 'open');
  assert.ok(p.zones.trips.claimHashes.words['api/t.ts']);
});

test('map clears only after all surfaces covered across missions', async () => {
  const root = await setup();
  setRungs(root, { words: 'cleared', map: 'open' });
  mission(root, 'trips-map-1', { zone: 'trips', rung: 'map', board: 'component', cardIds: ['c0', 'c2'] }, { got: 1, of: 1 });
  let out = await apply({ _: ['trips-map-1'], flags: {} }, ctx(root));
  assert.deepEqual(out.cleared, []);
  assert.equal('fog' in out, false);
  mission(root, 'trips-map-2', { zone: 'trips', rung: 'map', board: 'component', cardIds: ['c1', 'c2'] }, { got: 1, of: 1 });
  out = await apply({ _: ['trips-map-2'], flags: {} }, ctx(root));
  assert.deepEqual(out.cleared, ['map']);
  assert.equal(loadProgress(root).zones.trips.rungs.trace, 'open');
});

test('XP: halves, text grades, curiosity capped, challenge, hints, clamp at zero', async () => {
  const root = await setup();
  setRungs(root, { trace: 'open' });
  mission(root, 'trips-trace-1', { zone: 'trips', rung: 'trace', board: 'swimlanes', cardIds: ['c0', 'c1'] }, { got: 2.5, of: 5, hintsUsed: 1, missed: ['c1'], text: { c0: 'a', c1: 'b' } });
  const out = await apply({ _: ['trips-trace-1'], flags: { text: '{"c1":"solid","c0":"partial"}', curiosity: '5', 'challenge-won': '1' } }, ctx(root));
  assert.equal(out.xp, 25 + 30 + 15 + 20 - 15);
  assert.equal(out.ratio, 0.5);
  assert.deepEqual(loadProgress(root).zones.trips.weakSpots, [{ missionId: 'trips-trace-1', item: 'c1' }]);
  mission(root, 'trips-trace-2', { zone: 'trips', rung: 'trace', board: 'swimlanes', cardIds: ['c0'] }, { got: 0, of: 5, hintsUsed: 3 });
  assert.equal((await apply({ _: ['trips-trace-2'], flags: {} }, ctx(root))).xp, 0);
});

test('exam mode ignores curiosity', async () => {
  const root = await setup();
  setRungs(root, { trace: 'open' });
  mission(root, 'trips-trace-1', { zone: 'trips', rung: 'trace', board: 'swimlanes', cardIds: ['c0'] }, { got: 1, of: 5 }, 'exam');
  assert.equal((await apply({ _: ['trips-trace-1'], flags: { curiosity: '3' } }, ctx(root))).xp, 10);
  assert.equal(loadProgress(root).curiosity, 0);
});

test('weak spot removed when later answered correctly', async () => {
  const root = await setup();
  setRungs(root, { trace: 'open' });
  mission(root, 'trips-trace-1', { zone: 'trips', rung: 'trace', board: 'swimlanes', cardIds: ['c0', 'c1'] }, { got: 1, of: 2, missed: ['c1'] });
  await apply({ _: ['trips-trace-1'], flags: {} }, ctx(root));
  mission(root, 'trips-trace-2', { zone: 'trips', rung: 'trace', board: 'swimlanes', cardIds: ['c0', 'c1'] }, { got: 2, of: 2, missed: [] });
  const out = await apply({ _: ['trips-trace-2'], flags: {} }, ctx(root));
  assert.equal(out.weak, 0);
});

test('boss needs board ratio and 3 solid answers; claim opens final boss for single zone', async () => {
  const root = await setup();
  setRungs(root, { words: 'cleared', map: 'cleared', trace: 'cleared', break: 'cleared', boss: 'open' });
  mission(root, 'trips-boss-1', { zone: 'trips', rung: 'boss', board: 'component', cardIds: ['c0', 'c1', 'c2'] }, { got: 4, of: 5 });
  let out = await apply({ _: ['trips-boss-1'], flags: { text: '{"q1":"solid","q2":"solid","q3":"partial","q4":"miss","q5":"miss"}' } }, ctx(root));
  assert.equal(out.claimed, false);
  mission(root, 'trips-boss-2', { zone: 'trips', rung: 'boss', board: 'component', cardIds: ['c0', 'c1', 'c2'] }, { got: 4, of: 5 });
  out = await apply({ _: ['trips-boss-2'], flags: { text: '{"q1":"solid","q2":"solid","q3":"solid","q4":"miss","q5":"miss"}' } }, ctx(root));
  assert.equal(out.claimed, true);
  assert.ok(out.badges.includes('defender'));
  assert.equal(loadProgress(root).finalBoss, 'open');
});

test('refresh mission clears fog and re-stamps claim hashes', async () => {
  const root = await setup();
  const p = loadProgress(root);
  Object.assign(p.zones.trips, { fogged: true, claimHashes: { map: { 'api/t.ts': 'old' } } });
  p.zones.trips.rungs.map = 'cleared';
  saveProgress(root, p);
  mission(root, 'trips-map-9', { zone: 'trips', rung: 'map', board: 'component', cardIds: ['c0'], refresh: true }, { got: 1, of: 1 });
  const out = await apply({ _: ['trips-map-9'], flags: {} }, ctx(root));
  assert.equal(out.xp, 10 + 30);
  assert.equal(out.fog, 'cleared');
  const z = loadProgress(root).zones.trips;
  assert.equal(z.fogged, false);
  assert.notEqual(z.claimHashes.map['api/t.ts'], 'old');
});

test('token log uses --tokens when given, else estimate; double apply refused', async () => {
  const root = await setup();
  await apply({ _: ['trips-words-1'], flags: { got: '1', of: '1', tokens: '1200,300' } }, ctx(root));
  assert.deepEqual(loadProgress(root).tokens.at(-1).est, 1500);
  await assert.rejects(apply({ _: ['trips-words-1'], flags: { got: '1', of: '1' } }, ctx(root)), /mission "trips-words-1" already applied/);
});

test('boss claim XP: mission + rung + claim bonus, once', async () => {
  const root = await setup();
  setRungs(root, { words: 'cleared', map: 'cleared', trace: 'cleared', break: 'cleared', boss: 'open' });
  mission(root, 'trips-boss-1', { zone: 'trips', rung: 'boss', board: 'component', cardIds: ['c0', 'c1', 'c2'] }, { got: 4, of: 5 });
  const out = await apply({ _: ['trips-boss-1'], flags: { text: '{"q1":"solid","q2":"solid","q3":"solid"}' } }, ctx(root));
  assert.equal(out.xp, 40 + 60 + 50 + 200);
  assert.deepEqual(out.cleared, ['boss']);
  mission(root, 'trips-boss-2', { zone: 'trips', rung: 'boss', board: 'component', cardIds: ['c0', 'c1', 'c2'] }, { got: 4, of: 5 });
  const again = await apply({ _: ['trips-boss-2'], flags: { text: '{"q1":"solid","q2":"solid","q3":"solid"}' } }, ctx(root));
  assert.equal(again.xp, 100);
  assert.equal(again.claimed, false);
});

test('missed edge becomes weak spot and clears when its cards are answered', async () => {
  const root = await setup();
  setRungs(root, { map: 'open' });
  mission(root, 'trips-map-1', { zone: 'trips', rung: 'map', board: 'component', cardIds: ['c0', 'c1'] }, { got: 0, of: 1, missed: ['e1'] });
  assert.equal((await apply({ _: ['trips-map-1'], flags: {} }, ctx(root))).weak, 1);
  mission(root, 'trips-map-2', { zone: 'trips', rung: 'map', board: 'component', cardIds: ['c0', 'c1'] }, { got: 1, of: 1 });
  assert.equal((await apply({ _: ['trips-map-2'], flags: {} }, ctx(root))).weak, 0);
});

test('invalid input is rejected before any write', async () => {
  const root = await setup();
  const before = JSON.stringify(loadProgress(root));
  const bad = [
    [['trips-words-1'], {}, /needs --got and --of/],
    [['trips-words-1'], { got: '3', of: '2' }, /greater than of/],
    [['trips-words-1'], { got: '-1', of: '2' }, /--got must be a non-negative number/],
    [['trips-words-1'], { got: 'x', of: '2' }, /--got must be/],
    [['trips-words-1'], { got: '1' }, /given together/],
    [['trips-words-1'], { got: true, of: '2' }, /--got must be/],
    [['trips-words-1'], { got: '1', of: '2', curiosity: 'NaN' }, /--curiosity must be/],
    [['trips-words-1'], { got: '1', of: '2', 'challenge-won': '-2' }, /--challenge-won must be/],
    [['trips-words-1'], { got: '1', of: '2', tokens: '12' }, /--tokens must be/],
    [['trips-words-1'], { got: '1', of: '2', text: '[1]' }, /--text must be a JSON object/],
    [['trips-words-1'], { got: '1', of: '2', text: '{"a":"great"}' }, /must be solid, partial or miss/],
    [['nope-words-1'], { got: '1', of: '2' }, /unknown zone "nope"/],
    [['trips-map-7'], {}, /unknown mission "trips-map-7"/],
  ];
  for (const [_, flags, re] of bad) await assert.rejects(apply({ _, flags }, ctx(root)), re);
  assert.equal(JSON.stringify(loadProgress(root)), before);
});

test('session mission with an unknown rung is rejected before any write', async () => {
  const root = await setup();
  mission(root, 'trips-x-1', { zone: 'trips', rung: 'bogus', board: 'component', cardIds: ['c0'] }, { got: 1, of: 1 });
  const before = JSON.stringify(loadProgress(root));
  await assert.rejects(apply({ _: ['trips-x-1'], flags: {} }, ctx(root)), /invalid rung "bogus" for mission "trips-x-1"/);
  assert.equal(JSON.stringify(loadProgress(root)), before);
});

test('board mission in a session without mode defaults to practice (curiosity counts)', async () => {
  const root = await setup();
  setRungs(root, { trace: 'open' });
  mission(root, 'trips-trace-1', { zone: 'trips', rung: 'trace', board: 'swimlanes', cardIds: ['c0'] }, { got: 1, of: 5 });
  const sp = join(root, '.own-it', 'session.json');
  const s = readJson(sp); delete s.mode; writeJson(sp, s);
  await apply({ _: ['trips-trace-1'], flags: { curiosity: '2' } }, ctx(root));
  assert.equal(loadProgress(root).curiosity, 2);
});

test('answer.missed must be string ids', async () => {
  const root = await setup();
  setRungs(root, { trace: 'open' });
  mission(root, 'trips-trace-1', { zone: 'trips', rung: 'trace', board: 'swimlanes', cardIds: ['c0'] }, { got: 1, of: 5, missed: [1, 'c1'] });
  await assert.rejects(apply({ _: ['trips-trace-1'], flags: {} }, ctx(root)), /invalid answer: missed must be string ids/);
});

test('token log entries carry the session (null for words without a session file)', async () => {
  const root = await setup();
  await apply({ _: ['trips-words-1'], flags: { got: '1', of: '1' } }, ctx(root));
  assert.equal(loadProgress(root).tokens.at(-1).session, null);
  setRungs(root, { trace: 'open' });
  mission(root, 'trips-trace-1', { zone: 'trips', rung: 'trace', board: 'swimlanes', cardIds: ['c0'] }, { got: 1, of: 5 });
  await apply({ _: ['trips-trace-1'], flags: {} }, ctx(root));
  assert.equal(loadProgress(root).tokens.at(-1).session, '2026-10-13T16:00:00.000Z');
});

function seedWeak(root, items) {
  const p = loadProgress(root);
  p.zones.trips.weakSpots = items.map((item) => ({ missionId: 'old-1', item }));
  saveProgress(root, p);
}
const weakItems = (root) => loadProgress(root).zones.trips.weakSpots.map((w) => w.item).sort();

test('weak spots: map clears only edges among its cards', async () => {
  const root = await setup();
  setRungs(root, { map: 'open' });
  seedWeak(root, ['c0', 'c2', 'e1']);
  mission(root, 'trips-map-1', { zone: 'trips', rung: 'map', board: 'component', cardIds: ['c0', 'c1', 'c2'] }, { got: 1, of: 1 });
  await apply({ _: ['trips-map-1'], flags: {} }, ctx(root));
  assert.deepEqual(weakItems(root), ['c0', 'c2']);
});

test('weak spots: trace clears its cards, not edges; wrong-lane cards become weak', async () => {
  const root = await setup();
  setRungs(root, { trace: 'open' });
  seedWeak(root, ['c1', 'e1']);
  mission(root, 'trips-trace-1', { zone: 'trips', rung: 'trace', board: 'swimlanes', cardIds: ['c0', 'c1'] },
    { got: 1.5, of: 2, wrong: [['c0', 'Backend']] });
  await apply({ _: ['trips-trace-1'], flags: {} }, ctx(root));
  assert.deepEqual(weakItems(root), ['c0', 'e1']);
});

test('weak spots: break clears threats only', async () => {
  const root = await setup();
  setRungs(root, { break: 'open' });
  seedWeak(root, ['c0', 'x1', 'x2']);
  mission(root, 'trips-break-1', { zone: 'trips', rung: 'break', board: 'component', cardIds: ['c0', 'c1'], threatIds: ['x1', 'x2'] },
    { got: 1, of: 2, missed: ['x2'] });
  await apply({ _: ['trips-break-1'], flags: {} }, ctx(root));
  assert.deepEqual(weakItems(root), ['c0', 'x2']);
});

test('weak spots: boss clears its cards and the edges among them', async () => {
  const root = await setup();
  setRungs(root, { boss: 'open' });
  seedWeak(root, ['c0', 'e1', 'x1']);
  mission(root, 'trips-boss-1', { zone: 'trips', rung: 'boss', board: 'component', cardIds: ['c0', 'c1'] }, { got: 3, of: 3 });
  await apply({ _: ['trips-boss-1'], flags: {} }, ctx(root));
  assert.deepEqual(weakItems(root), ['x1']);
});

test('weak spots: words and --got/--of without an answer file clear nothing', async () => {
  const root = await setup();
  setRungs(root, { map: 'open' });
  seedWeak(root, ['c0', 'e1']);
  await apply({ _: ['trips-words-1'], flags: { got: '5', of: '5' } }, ctx(root));
  mission(root, 'trips-map-1', { zone: 'trips', rung: 'map', board: 'component', cardIds: ['c0', 'c1'] });
  await apply({ _: ['trips-map-1'], flags: { got: '3', of: '3' } }, ctx(root));
  assert.deepEqual(weakItems(root), ['c0', 'e1']);
});

test('--text keys must be answer text keys (plus q1..q5 on boss); never on words', async () => {
  const root = await setup();
  setRungs(root, { trace: 'open', boss: 'open' });
  const before = JSON.stringify(loadProgress(root));
  mission(root, 'trips-trace-1', { zone: 'trips', rung: 'trace', board: 'swimlanes', cardIds: ['c0'] }, { got: 1, of: 1, text: { c0: 'why', 'tok:x1': 'how' } });
  await assert.rejects(apply({ _: ['trips-trace-1'], flags: { text: '{"c0":"solid","q1":"solid"}' } }, ctx(root)),
    /--text key "q1" is not in the answer; allowed: c0,tok:x1/);
  mission(root, 'trips-boss-1', { zone: 'trips', rung: 'boss', board: 'component', cardIds: ['c0', 'c1'] }, { got: 3, of: 3, text: { c0: 'pin' } });
  await assert.rejects(apply({ _: ['trips-boss-1'], flags: { text: '{"q6":"solid"}' } }, ctx(root)),
    /--text key "q6" is not in the answer; allowed: c0,q1,q2,q3,q4,q5/);
  await assert.rejects(apply({ _: ['trips-words-1'], flags: { got: '1', of: '1', text: '{"q1":"solid"}' } }, ctx(root)),
    /--text does not apply to words missions/);
  assert.equal(JSON.stringify(loadProgress(root)), before);
});

test('boss solids count q1..q5 only', async () => {
  const root = await setup();
  setRungs(root, { boss: 'open' });
  mission(root, 'trips-boss-1', { zone: 'trips', rung: 'boss', board: 'component', cardIds: ['c0', 'c1'] }, { got: 3, of: 3, text: { c0: 'pin' } });
  const out = await apply({ _: ['trips-boss-1'], flags: { text: '{"c0":"solid","q1":"solid","q2":"solid"}' } }, ctx(root));
  assert.deepEqual(out.cleared, []);
});
