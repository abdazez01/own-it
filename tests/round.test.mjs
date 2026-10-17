import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { run as init } from '../own-it/scripts/lib/cmd-init.mjs';
import { run as build } from '../own-it/scripts/lib/cmd-build-round.mjs';
import { run as collect } from '../own-it/scripts/lib/cmd-collect.mjs';
import { run as buildMissions } from '../own-it/scripts/lib/cmd-build-missions.mjs';
import { run as apply } from '../own-it/scripts/lib/cmd-apply.mjs';
import { loadModel, saveModel } from '../own-it/scripts/lib/model.mjs';
import { loadProgress, saveProgress } from '../own-it/scripts/lib/progress.mjs';
import { readJson, writeJson } from '../own-it/scripts/lib/json.mjs';
import core from '../own-it/scripts/lib/core.mjs';
import { tmpProject, ctx } from './helpers.mjs';

const I = (o) => ({ conf: 'high', ref: 'api/t.ts:1', ...o });
async function setup() {
  const root = tmpProject({ 'api/t.ts': 'x\n' });
  writeFileSync(join(root, 'zones.json'), JSON.stringify({ zones: [{ id: 'trips', name: 'Trips', paths: ['api'] }] }));
  await init({ _: [], flags: { zones: join(root, 'zones.json') } }, ctx(root));
  const m = loadModel(root);
  m.zones.trips.items = [
    I({ id: 's1', k: 'surface', label: 'Trip screen' }),
    I({ id: 's2', k: 'surface', label: 'Approvals' }),
    I({ id: 'el1', k: 'element', on: 's1', does: 'f1', goes: 's2' }),
    I({ id: 'el2', k: 'element', on: 's2', does: 'f1', goes: 's1' }),
    I({ id: 'e1', k: 'edge', from: 's1', to: 's2' }),
    I({ id: 'f1', k: 'flow', label: 'cancel', steps: [['s1'], ['s2']] }),
  ];
  saveModel(root, m);
  return root;
}
const opts = (t) => [0, 1, 2, 3].map((i) => ({ text: t ? t[i] : `Option number ${i}`, why: 'Because of the product rule.' }));
const quiz = (over = {}) => ({ zone: 'trips', mode: 'practice',
  questions: Array.from({ length: 5 }, (_, i) => ({ q: `Question ${i}?`, options: opts(), answer: i % 4 })), ...over });
function put(root, obj, name = 'in.json') {
  const p = join(root, name);
  writeFileSync(p, JSON.stringify(obj));
  return p;
}
const bld = (root, game, obj) => build({ _: [game, put(root, obj)], flags: {} }, ctx(root));
const loadRound = (root, id) => {
  const sb = { window: {} };
  vm.runInNewContext(readFileSync(join(root, '.own-it', 'data', `${id}.js`), 'utf8'), sb);
  assert.ok(Object.hasOwn(sb.window.OWNIT_ROUNDS, id));
  return JSON.parse(JSON.stringify(sb.window.OWNIT_ROUNDS[id]));
};

test('quiz round obfuscates answers', async () => {
  const root = await setup();
  const out = await bld(root, 'quiz', quiz());
  assert.equal(out.id, 'trips-quiz-1');
  assert.ok(out.est > 0);
  const r = loadRound(root, out.id);
  assert.equal(typeof r.questions[0].answer, 'string');
  assert.equal(core.decode(r.questions[2].answer), 2);
  assert.equal(r.game, 'quiz');
  assert.deepEqual(readJson(join(root, '.own-it', 'session.json')).rounds['trips-quiz-1'], { game: 'quiz', zone: 'trips', rung: 'words', mode: 'practice', cardIds: [] });
  assert.equal(loadProgress(root).seq, 1);
});

test('identifier-only option rejected', async () => {
  const root = await setup();
  const q = quiz();
  q.questions[1].options[2].text = 'cancelTrip';
  await assert.rejects(bld(root, 'quiz', q), /identifier-only answer in questions\[1\]\.options\[2\]/);
  q.questions[1].options[2].text = '`cancel`';
  await assert.rejects(bld(root, 'quiz', q), /identifier-only/);
  q.questions[1].options[2].text = 'trip_state';
  await assert.rejects(bld(root, 'quiz', q), /identifier-only/);
  assert.ok(!existsSync(join(root, '.own-it', 'data')));
});

test('missing answer, unknown game and bad zone are rejected', async () => {
  const root = await setup();
  const q = quiz();
  delete q.questions[3].answer;
  await assert.rejects(bld(root, 'quiz', q), /missing answer in questions\[3\]/);
  await assert.rejects(bld(root, 'nope', quiz()), /unknown game "nope"/);
  await assert.rejects(bld(root, 'quiz', quiz({ zone: 'zzz' })), /unknown zone "zzz"/);
});

test('foreign ids rejected, nothing written', async () => {
  const root = await setup();
  await assert.rejects(bld(root, 'whiteboard', { zone: 'trips', cards: ['s1', 'ghost', 'zed'] }), /ids not in zone "trips": ghost, zed/);
  assert.ok(!existsSync(join(root, '.own-it', 'data')));
  assert.ok(!existsSync(join(root, '.own-it', 'session.json')));
  assert.equal(loadProgress(root).seq, 0);
});

test('quests fills expected path from element.does', async () => {
  const root = await setup();
  const out = await bld(root, 'quests', { zone: 'trips', flow: 'f1', goal: 'Cancel and refund', start: 's1',
    objectives: [{ text: 'Cancel the trip', element: 'el1' }, { text: 'Approve the refund', element: 'el2' }] });
  const r = loadRound(root, out.id);
  assert.equal(r.rung, 'trace');
  const path = core.decode(r.answer);
  assert.deepEqual(path.map((p) => p.does), ['f1', 'f1']);
  assert.deepEqual(path.map((p) => p.element), ['el1', 'el2']);
});

test('quests round carries plain navigation facts (goes, roles) for reachable elements, with labels', async () => {
  const root = await setup();
  const m = loadModel(root);
  const it = m.zones.trips.items;
  it.find((x) => x.id === 'el2').roles = ['r1'];
  it.push(I({ id: 'r1', k: 'role', label: 'Manager' }), I({ id: 's9', k: 'surface', label: 'Island' }),
    I({ id: 'el8', k: 'element', on: 's9', does: 'f1' }), I({ id: 'el7', k: 'element', on: 's2', label: 'Back link', purpose: 'Returns to the trip.' }));
  saveModel(root, m);
  const out = await bld(root, 'quests', { zone: 'trips', flow: 'f1', goal: 'g', start: 's1',
    objectives: [{ text: 'a', element: 'el1' }, { text: 'b', element: 'el2' }] });
  const r = loadRound(root, out.id);
  assert.deepEqual(r.nav.el1, { on: 's1', goes: 's2' });
  assert.deepEqual(r.nav.el2, { on: 's2', goes: 's1', roles: ['r1'] });
  assert.equal(r.nav.el7.on, 's2');
  assert.ok(!Object.hasOwn(r.nav, 'el8'), 'unreachable screens are left out');
  assert.equal(r.labels.r1.label, 'Manager');
  assert.equal(r.labels.el7.purpose, 'Returns to the trip.');
});

test('whiteboard derives answer edges; boss-battle has no answer', async () => {
  const root = await setup();
  const w = await bld(root, 'whiteboard', { zone: 'trips', cards: ['s1', 's2'] });
  assert.deepEqual(core.decode(loadRound(root, w.id).answer).edges, [{ id: 'e1', from: 's1', to: 's2' }]);
  const b = await bld(root, 'boss-battle', { zone: 'trips', questions: Array.from({ length: 5 }, () => ({ q: 'Why?', kind: 'why' })) });
  assert.equal(b.id, 'trips-boss-battle-2');
  assert.equal(loadRound(root, b.id).answer, undefined);
});

function answered(root, id, extra) {
  writeJson(join(root, '.own-it', 'answers', `${id}.json`),
    { id, submittedAt: '2026-10-13T16:05:00.000Z', text: {}, hintsUsed: 0, challenges: [], missed: [], ...extra });
}

test('apply quiz round clears words at 4/5', async () => {
  const root = await setup();
  const { id } = await bld(root, 'quiz', quiz());
  answered(root, id, { got: 4, of: 5 });
  const out = await apply({ _: [id], flags: {} }, ctx(root));
  assert.deepEqual(out.cleared, ['words']);
  assert.equal(out.xp, 40 + 50);
  assert.equal(loadProgress(root).zones.trips.rungs.words, 'cleared');
});

test('apply quest clean run +50 and wrong turns -5', async () => {
  const root = await setup();
  const mk = () => bld(root, 'quests', { zone: 'trips', flow: 'f1', goal: 'g', start: 's1',
    objectives: [{ text: 'a', element: 'el1' }, { text: 'b', element: 'el2' }] });
  const { id } = await mk();
  answered(root, id, { got: 2, of: 2, wrong: [] });
  const out = await apply({ _: [id], flags: {} }, ctx(root));
  assert.equal(out.xp, 20 + 50 + 50); // objectives + clean run + trace rung
  const r2 = await mk();
  answered(root, r2.id, { got: 2, of: 2, wrong: [['el2', 'el1'], ['el1', 'el1']] });
  const out2 = await apply({ _: [r2.id], flags: {} }, ctx(root));
  assert.equal(out2.xp, 20 - 10);
});

test('apply teach-back style rung none gives only curiosity xp', async () => {
  const root = await setup();
  const gd = join(import.meta.dirname, '..', 'own-it', 'assets', 'games');
  assert.ok(readdirSync(gd).includes('teach-back.meta.json'));
  const sp = join(root, '.own-it', 'session.json');
  writeJson(sp, { session: '2026-10-13T16:00:00.000Z', mode: 'practice', missions: {},
    rounds: { 'trips-teach-back-1': { game: 'teach-back', zone: 'trips', rung: 'none', mode: 'practice', cardIds: [] } } });
  answered(root, 'trips-teach-back-1', { got: 1, of: 1 });
  const out = await apply({ _: ['trips-teach-back-1'], flags: { curiosity: '2' } }, ctx(root));
  assert.equal(out.xp, 10);
  assert.deepEqual(out.cleared, []);
});

test('two rounds coexist; collect and apply the first', async () => {
  const root = await setup();
  const a = await bld(root, 'quiz', quiz());
  await bld(root, 'quiz', quiz({ mode: 'exam' }));
  const sj = readJson(join(root, '.own-it', 'session.json'));
  assert.deepEqual(Object.keys(sj.rounds), [a.id, 'trips-quiz-2']);
  assert.equal(sj.rounds['trips-quiz-2'].mode, 'exam');
  assert.equal(sj.mode, 'practice');
  writeJson(join(root, '.own-it', 'inbox', '1-result.json'), { type: 'result', id: a.id, submittedAt: '2026-10-13T16:30:00.000Z', got: 5, of: 5, missed: [], text: {}, hintsUsed: 0 });
  const col = await collect({ _: [a.id], flags: {} }, ctx(root));
  assert.equal(col.got, 5);
  const out = await apply({ _: [a.id], flags: {} }, ctx(root));
  assert.deepEqual(out.cleared, ['words']);
});

test('build-missions preserves rounds', async () => {
  const root = await setup();
  await bld(root, 'quiz', quiz());
  writeFileSync(join(root, 'r.json'), JSON.stringify({ mode: 'practice', missions: [{ zone: 'trips', rung: 'map', board: 'component', brief: 'b', cards: ['s1', 's2'] }] }));
  await buildMissions({ _: [join(root, 'r.json')], flags: {} }, ctx(root));
  assert.ok(readJson(join(root, '.own-it', 'session.json')).rounds['trips-quiz-1']);
});

const tour = (over = {}) => ({ zone: 'trips', screen: 's1', steps: [{ kind: 'find', prompt: 'Which control cancels?', element: 'el1', choices: ['el1', 'el2'], answer: 'el1' }], ...over });

test('screen-tour pass counts its surfaces for map', async () => {
  const root = await setup();
  const p = loadProgress(root);
  p.zones.trips.rungs.words = 'cleared'; p.zones.trips.rungs.map = 'open';
  saveProgress(root, p);
  const t = await bld(root, 'screen-tour', tour());
  assert.deepEqual(readJson(join(root, '.own-it', 'session.json')).rounds[t.id].cardIds, ['s1']);
  answered(root, t.id, { got: 1, of: 1 });
  await apply({ _: [t.id], flags: {} }, ctx(root));
  assert.deepEqual(loadProgress(root).zones.trips.surfacesCovered, ['s1']);
});

test('answer must be one of the choices; role choices obey identifier ban', async () => {
  const root = await setup();
  const bad = tour(); bad.steps[0].answer = 'zzz';
  await assert.rejects(bld(root, 'screen-tour', bad), /answer is not one of the choices in steps\[0\]/);
  const role = tour({ steps: [{ kind: 'role', prompt: 'Who?', choices: ['driver_role', 'Manager'], answer: 'Manager' }] });
  await assert.rejects(bld(root, 'screen-tour', role), /identifier-only answer in steps\[0\]\.choices\[0\]; use the name a person would say/);
  await assert.rejects(bld(root, 'guess-the-screen', { zone: 'trips', screens: [1, 2, 3].map(() => ({ screen: 's1', choices: ['s1', 's2', 'ghost', 'x'], answer: 's1' })) }), /ids not in zone "trips": ghost, x/);
  await assert.rejects(bld(root, 'quiz', quiz({ questions: quiz().questions.map((q) => ({ ...q, answer: 4 })) })), /above 3/);
});

test('quests objectives must be non-duplicate elements of the flow', async () => {
  const root = await setup();
  const m = loadModel(root);
  m.zones.trips.items.push(I({ id: 'el9', k: 'element', on: 's1', does: 'e1' }));
  saveModel(root, m);
  const q = (objectives) => bld(root, 'quests', { zone: 'trips', flow: 'f1', goal: 'g', start: 's1', objectives });
  await assert.rejects(q([{ text: 'a', element: 'el1' }, { text: 'b', element: 'el9' }]), /element "el9" does not belong to flow "f1"/);
  await assert.rejects(q([{ text: 'a', element: 'el1' }, { text: 'b', element: 'el1' }]), /duplicate objective element "el1"/);
  await assert.rejects(q([{ text: 'a', element: 'el1' }, { text: 'b', element: 's2' }]), /objective "s2" is not an element/);
});

test('rung none ignores text grades, challenges and hints', async () => {
  const root = await setup();
  writeJson(join(root, '.own-it', 'session.json'), { session: '2026-10-13T16:00:00.000Z', mode: 'practice', missions: {},
    rounds: { 'trips-teach-back-1': { game: 'teach-back', zone: 'trips', rung: 'none', mode: 'practice', cardIds: [] } } });
  answered(root, 'trips-teach-back-1', { got: 1, of: 1, text: { t: 'solid' }, hintsUsed: 2 });
  const out = await apply({ _: ['trips-teach-back-1'], flags: { text: '{"t":"solid"}', curiosity: '1', 'challenge-won': '2' } }, ctx(root));
  assert.equal(out.xp, 5);
});

test('screen-tour find answer must be a zone id; quest start must match first objective', async () => {
  const root = await setup();
  const t = tour(); delete t.steps[0].choices; t.steps[0].answer = 'ghost';
  await assert.rejects(bld(root, 'screen-tour', t), /answer not in zone "trips" in steps\[0\]/);
  t.steps[0].answer = 'el1';
  await bld(root, 'screen-tour', t);
  const q = (start) => bld(root, 'quests', { zone: 'trips', flow: 'f1', goal: 'g', start, objectives: [{ text: 'a', element: 'el1' }, { text: 'b', element: 'el2' }] });
  await assert.rejects(q('s2'), /start must be the screen of the first objective/);
  await assert.rejects(q('el1'), /start must be the screen of the first objective/);
});

test('quests reject an objective whose screen is not reachable from start via goes', async () => {
  const root = await setup();
  const m = loadModel(root);
  m.zones.trips.items.push(I({ id: 's9', k: 'surface', label: 'Island' }), I({ id: 'el9', k: 'element', on: 's9', does: 'f1' }));
  saveModel(root, m);
  await assert.rejects(bld(root, 'quests', { zone: 'trips', flow: 'f1', goal: 'g', start: 's1',
    objectives: [{ text: 'a', element: 'el1' }, { text: 'b', element: 'el9' }] }), /objective el9 not reachable from start/);
});

test('rounds carry plain labels for every referenced model id, never for a find answer', async () => {
  const root = await setup();
  const t = tour({ steps: [{ kind: 'find', prompt: 'Which control cancels?', element: 'el1', answer: 'el2' }] });
  const out = await bld(root, 'screen-tour', t);
  const r = loadRound(root, out.id);
  assert.equal(r.labels.s1.label, 'Trip screen');
  assert.equal(r.labels.s1.kind, 'surface'); // lets the whiteboard lay out without the answer
  assert.equal(r.labels.s2.label, 'Approvals'); // el1 goes to s2
  assert.equal(r.labels.el1.label, 'el1');      // no label in the model: falls back to the id
  assert.ok(!Object.hasOwn(r.labels, 'el2'), 'the find answer must not be labelled');
  const g = await bld(root, 'guess-the-screen', { zone: 'trips', screens: [1, 2, 3].map(() => ({ screen: 's1', choices: ['s1', 's2', 'el1', 'el2'], answer: 's1' })) });
  assert.equal(loadRound(root, g.id).labels.s2.label, 'Approvals');
  const q = await bld(root, 'quiz', quiz());
  assert.equal(JSON.stringify(loadRound(root, q.id).labels), '{}');
});

// ---- fix wave 16b: quests across roles, aggregated registries

test('quests accept an objective on another screen when it needs a different role (role switch)', async () => {
  const root = await setup();
  const m = loadModel(root);
  const it = m.zones.trips.items;
  it.find((x) => x.id === 'el1').goes = undefined;
  it.find((x) => x.id === 'el1').roles = ['r1'];
  it.find((x) => x.id === 'el2').roles = ['r2'];
  it.push(I({ id: 'r1', k: 'role', label: 'Driver' }), I({ id: 'r2', k: 'role', label: 'Manager' }),
    I({ id: 's7', k: 'surface', label: 'Tail' }), I({ id: 'el3', k: 'element', on: 's7', does: 'f1' }));
  saveModel(root, m);
  const out = await bld(root, 'quests', { zone: 'trips', flow: 'f1', goal: 'g', start: 's1',
    objectives: [{ text: 'a', element: 'el1' }, { text: 'b', element: 'el2' }] });
  const r = loadRound(root, out.id);
  assert.ok(Object.hasOwn(r.nav, 'el2'), 'nav covers the objective screen after the switch');
  assert.equal(r.nav.el2.goes, 's1');
  assert.ok(Object.hasOwn(r.nav, 'el1'), 'and screens reachable from it');
  // same roles on both: still unreachable
  const m2 = loadModel(root);
  m2.zones.trips.items.find((x) => x.id === 'el3').roles = ['r1'];
  saveModel(root, m2);
  await assert.rejects(bld(root, 'quests', { zone: 'trips', flow: 'f1', goal: 'g', start: 's1',
    objectives: [{ text: 'a', element: 'el1' }, { text: 'b', element: 'el3' }] }), /objective el3 not reachable from start/);
});

test('build-round regenerates rounds.js with every round', async () => {
  const root = await setup();
  const a = await bld(root, 'quiz', quiz());
  const b = await bld(root, 'quiz', quiz());
  const sb = { window: {} };
  vm.runInNewContext(readFileSync(join(root, '.own-it', 'rounds.js'), 'utf8'), sb);
  assert.deepEqual(Object.keys(sb.window.OWNIT_ROUNDS).sort(), [a.id, b.id]);
  assert.ok(existsSync(join(root, '.own-it', 'data', `${a.id}.js`)), 'per-id files are kept');
});

// ---- v2.1 pack 1: memory-match, spot-the-lie, chain-reaction

const pairs = (n = 4) => Array.from({ length: n }, (_, i) => ({ term: `Term number ${i}`, meaning: `What term ${i} means for a rider` }));
const lie = (over = {}) => ({ zone: 'trips', statements: Array.from({ length: 5 }, (_, i) => ({ text: `Statement ${i} about trips`, why: `Reason ${i} in plain words` })), answer: 2, ...over });

test('memory-match: terms and meanings are randomly permuted, pairing only in the obfuscated answer', async () => {
  const root = await setup();
  const maps = new Set(), termOrders = new Set();
  for (let k = 0; k < 20; k++) {
    const n = 4 + (k % 3);
    const out = await bld(root, 'memory-match', { zone: 'trips', pairs: pairs(n) });
    const r = loadRound(root, out.id);
    if (k === 0) assert.equal(out.id, 'trips-memory-match-1');
    assert.equal(r.pairs, undefined);
    assert.equal(r.terms.length, n);
    assert.equal(r.meanings.length, n);
    assert.equal(typeof r.answer, 'string');
    const map = core.decode(r.answer);
    r.terms.forEach((t, i) => assert.equal(r.meanings[map[i]], `What term ${t.split(' ')[2]} means for a rider`));
    assert.ok(map.every((m, i) => m !== i), 'no meaning sits at its own term position');
    assert.ok(![...Array(n).keys()].some((off) => map.every((m, i) => m === (i + off) % n)), 'not a fixed offset or rotation');
    maps.add(map.join()); termOrders.add(r.terms.join());
  }
  assert.ok(maps.size > 3, 'mappings vary between builds');
  assert.ok(termOrders.size > 3, 'term order varies between builds');
  assert.equal(readJson(join(root, '.own-it', 'session.json')).rounds['trips-memory-match-1'].rung, 'words');
});

test('memory-match: 3 or 9 pairs, duplicates and identifier-only text are rejected', async () => {
  const root = await setup();
  await assert.rejects(bld(root, 'memory-match', { zone: 'trips', pairs: pairs(3) }), /at least 4/);
  await assert.rejects(bld(root, 'memory-match', { zone: 'trips', pairs: pairs(9) }), /at most 8/);
  const dup = pairs(4); dup[1].term = dup[0].term;
  await assert.rejects(bld(root, 'memory-match', { zone: 'trips', pairs: dup }), /duplicate term/);
  const same = pairs(4); same[2].meaning = same[0].meaning;
  await assert.rejects(bld(root, 'memory-match', { zone: 'trips', pairs: same }), /duplicate meaning/);
  const code = pairs(4); code[0].term = 'cancel_trip';
  await assert.rejects(bld(root, 'memory-match', { zone: 'trips', pairs: code }), /identifier-only answer in pairs\[0\]\.term/);
  const code2 = pairs(4); code2[3].meaning = 'src/api/trips.ts';
  await assert.rejects(bld(root, 'memory-match', { zone: 'trips', pairs: code2 }), /identifier-only answer in pairs\[3\]\.meaning/);
  await assert.rejects(bld(root, 'memory-match', { zone: 'nope', pairs: pairs(4) }), /unknown zone/);
});

test('spot-the-lie: answer obfuscated, needs 5 statements and an index', async () => {
  const root = await setup();
  const out = await bld(root, 'spot-the-lie', lie());
  const r = loadRound(root, out.id);
  assert.equal(typeof r.answer, 'string');
  assert.equal(core.decode(r.answer), 2);
  assert.equal(r.statements.length, 5);
  assert.equal(readJson(join(root, '.own-it', 'session.json')).rounds[out.id].rung, 'words');
  await assert.rejects(bld(root, 'spot-the-lie', lie({ statements: lie().statements.slice(0, 4) })), /at least 5/);
  await assert.rejects(bld(root, 'spot-the-lie', lie({ answer: 5 })), /above 4/);
  await assert.rejects(bld(root, 'spot-the-lie', lie({ answer: undefined })), /answer: required/);
  const bad = lie(); bad.statements[1].text = 'cancel_trip';
  await assert.rejects(bld(root, 'spot-the-lie', bad), /identifier-only answer in statements\[1\]\.text/);
});

async function chainSetup() {
  const root = await setup();
  const m = loadModel(root);
  m.zones.trips.items.push(I({ id: 'c1', k: 'component', label: 'Trip service' }), I({ id: 'f2', k: 'flow', label: 'Pay out', steps: [['s1'], ['c1', 's2'], ['s2']] }),
    I({ id: 'f3', k: 'flow', label: 'Tiny', steps: [['s1']] }));
  saveModel(root, m);
  return root;
}

test('chain-reaction: steps derived from the flow, scrambled cards, ordered answer obfuscated, labels', async () => {
  const root = await chainSetup();
  const out = await bld(root, 'chain-reaction', { zone: 'trips', flow: 'f2' });
  const r = loadRound(root, out.id);
  assert.deepEqual(core.decode(r.answer), ['s1', 'c1', 's2']);
  assert.deepEqual(r.cards.map((c) => c.id).sort(), ['c1', 's1', 's2']);
  assert.notDeepEqual(r.cards.map((c) => c.id), ['s1', 'c1', 's2'], 'data order does not give the answer away');
  const orders = new Set();
  for (let k = 0; k < 20; k++) {
    const o = loadRound(root, (await bld(root, 'chain-reaction', { zone: 'trips', flow: 'f2' })).id).cards.map((c) => c.id);
    assert.notDeepEqual(o, ['s1', 'c1', 's2']);
    orders.add(o.join());
  }
  assert.ok(orders.size > 1, 'card order is shuffled, not sorted');
  assert.equal(r.labels.f2.label, 'Pay out');
  assert.equal(r.labels.c1.label, 'Trip service');
  assert.equal(r.flow, 'f2');
  const sess = readJson(join(root, '.own-it', 'session.json')).rounds[out.id];
  assert.equal(sess.rung, 'trace');
  assert.deepEqual(sess.cardIds.sort(), ['c1', 's1', 's2']);
});

test('chain-reaction: unknown flow, non-flow id and one-step flows are rejected', async () => {
  const root = await chainSetup();
  await assert.rejects(bld(root, 'chain-reaction', { zone: 'trips', flow: 'zzz' }), /ids not in zone/);
  await assert.rejects(bld(root, 'chain-reaction', { zone: 'trips', flow: 's1' }), /"s1" is not a flow/);
  await assert.rejects(bld(root, 'chain-reaction', { zone: 'trips', flow: 'f3' }), /at least 2 steps/);
});

// ---- v2.1 pack 1b: whos-allowed, blast-radius, pager

const perm = (n = 8, over = {}) => ({ zone: 'trips', cards: Array.from({ length: n }, (_, i) => ({
  action: `Cancel trip number ${i}`, role: i % 2 ? 'Rider' : 'Driver', answer: i % 2 ? 'deny' : 'allow', why: `Rule ${i} in plain words` })), ...over });

test('whos-allowed: cards shuffled, every answer obfuscated, 8-16 cards with both verdicts', async () => {
  const root = await setup();
  const orders = new Set();
  for (let k = 0; k < 12; k++) {
    const out = await bld(root, 'whos-allowed', perm(8 + (k % 9)));
    const r = loadRound(root, out.id);
    if (k === 0) assert.equal(out.id, 'trips-whos-allowed-1');
    assert.equal(r.cards.length, 8 + (k % 9));
    assert.ok(r.cards.every((c) => typeof c.answer === 'string' && !['allow', 'deny'].includes(c.answer)));
    r.cards.forEach((c) => assert.equal(core.decode(c.answer), Number(c.action.split(' ').pop()) % 2 ? 'deny' : 'allow'));
    orders.add(r.cards.map((c) => c.action).join());
  }
  assert.ok(orders.size > 3, 'card order varies between builds');
  assert.equal(readJson(join(root, '.own-it', 'session.json')).rounds['trips-whos-allowed-1'].rung, 'trace');
});

test('whos-allowed: size, verdict mix, bad verdicts and identifier-only actions are rejected', async () => {
  const root = await setup();
  await assert.rejects(bld(root, 'whos-allowed', perm(7)), /at least 8/);
  await assert.rejects(bld(root, 'whos-allowed', perm(17)), /at most 16/);
  const bad = perm(); bad.cards[2].answer = 'maybe';
  await assert.rejects(bld(root, 'whos-allowed', bad), /expected one of allow,deny/);
  const skew = perm(); skew.cards.forEach((c) => { c.answer = 'allow'; });
  await assert.rejects(bld(root, 'whos-allowed', skew), /at least 2 allow and 2 deny/);
  const code = perm(); code.cards[1].action = 'cancel_trip';
  await assert.rejects(bld(root, 'whos-allowed', code), /identifier-only answer in cards\[1\]\.action/);
  await assert.rejects(bld(root, 'whos-allowed', perm(8, { zone: 'nope' })), /unknown zone/);
});

async function blastSetup() {
  const root = await setup();
  const m = loadModel(root);
  m.zones.trips.items.push(
    I({ id: 'c1', k: 'component', label: 'Trip service' }), I({ id: 'c2', k: 'component', label: 'Database' }),
    I({ id: 'c3', k: 'component', label: 'Billing' }), I({ id: 'c4', k: 'component', label: 'Mailer' }), I({ id: 'c5', k: 'component' }),
    I({ id: 'e2', k: 'edge', from: 's1', to: 'c1' }), I({ id: 'e3', k: 'edge', from: 'c1', to: 'c2' }),
    I({ id: 'e4', k: 'edge', from: 'c3', to: 'c2' }), I({ id: 'e5', k: 'edge', from: 'c2', to: 'c1' }), I({ id: 'e6', k: 'edge', from: 'c4', to: 'c5' }));
  saveModel(root, m);
  return root;
}

test('blast-radius: damage set is reverse reachability over edges, nearest first, obfuscated', async () => {
  const root = await blastSetup();
  const out = await bld(root, 'blast-radius', { zone: 'trips', target: 'c2' });
  const r = loadRound(root, out.id);
  assert.equal(out.id, 'trips-blast-radius-1');
  assert.equal(r.target, 'c2');
  const dmg = core.decode(r.answer);
  assert.deepEqual(dmg.slice(0, 2).sort(), ['c1', 'c3'], 'direct dependants come first');
  assert.deepEqual([...dmg].sort(), ['c1', 'c3', 's1'], 'through a cycle, once each');
  assert.deepEqual(r.cards.map((c) => c.id).sort(), ['c1', 'c3', 'c4', 's1', 's2']);
  assert.ok(!r.cards.some((c) => c.id === 'c2' || c.id === 'c5'), 'the target and unlabeled parts are not shown');
  assert.equal(r.labels.c2.label, 'Database');
  assert.equal(r.labels.c3.label, 'Billing');
  const sess = readJson(join(root, '.own-it', 'session.json')).rounds[out.id];
  assert.equal(sess.rung, 'map');
  assert.ok(sess.cardIds.includes('c2') && sess.cardIds.includes('c4'));
  const orders = new Set();
  for (let k = 0; k < 12; k++) orders.add(loadRound(root, (await bld(root, 'blast-radius', { zone: 'trips', target: 'c2' })).id).cards.map((c) => c.id).join());
  assert.ok(orders.size > 3, 'card order is shuffled');
});

test('blast-radius: a target nobody depends on, a non-part target and an unlabeled target are rejected', async () => {
  const root = await blastSetup();
  await assert.rejects(bld(root, 'blast-radius', { zone: 'trips', target: 'c4' }), /nothing depends on/);
  await assert.rejects(bld(root, 'blast-radius', { zone: 'trips', target: 'f1' }), /"f1" is not a surface or component/);
  await assert.rejects(bld(root, 'blast-radius', { zone: 'trips', target: 'c5' }), /"c5" has no label/);
  await assert.rejects(bld(root, 'blast-radius', { zone: 'trips', target: 'zzz' }), /ids not in zone/);
});

async function pagerSetup() {
  const root = await setup();
  const m = loadModel(root);
  m.zones.trips.items.push(...['a', 'b', 'c', 'd', 'e'].map((x) => I({ id: `x${x}`, k: 'component', label: `Part ${x}` })));
  saveModel(root, m);
  return root;
}
const pagerIn = (over = {}) => ({ zone: 'trips', failure: 'Riders see an empty trip list.', answer: 'xc',
  logs: ['app opened trips', 'request sent', 'server asked the store', 'store answered slowly'], ...over });

test('pager: choices derived from same-kind parts with the answer among them, random order, answer obfuscated', async () => {
  const root = await pagerSetup();
  const orders = new Set();
  for (let k = 0; k < 16; k++) {
    const out = await bld(root, 'pager', pagerIn());
    const r = loadRound(root, out.id);
    if (k === 0) assert.equal(out.id, 'trips-pager-1');
    assert.equal(core.decode(r.answer), 'xc');
    assert.ok(r.cards.length >= 3 && r.cards.length <= 4);
    assert.ok(r.cards.some((c) => c.id === 'xc'));
    assert.ok(r.cards.every((c) => /^Part /.test(c.label)));
    assert.equal(new Set(r.cards.map((c) => c.id)).size, r.cards.length);
    assert.equal(r.labels.xc.label, 'Part c');
    orders.add(r.cards.map((c) => c.id).join());
  }
  assert.ok(orders.size > 3, 'order and choice set vary');
  assert.equal(readJson(join(root, '.own-it', 'session.json')).rounds['trips-pager-1'].rung, 'break');
});

test('pager: log count, unknown or unsuitable answers, too few look-alikes and identifier-only text are rejected', async () => {
  const root = await pagerSetup();
  await assert.rejects(bld(root, 'pager', pagerIn({ logs: ['a b', 'c d', 'e f'] })), /at least 4/);
  await assert.rejects(bld(root, 'pager', pagerIn({ logs: Array(9).fill('a b') })), /at most 8/);
  await assert.rejects(bld(root, 'pager', pagerIn({ answer: 'zzz' })), /ids not in zone/);
  await assert.rejects(bld(root, 'pager', pagerIn({ answer: 'f1' })), /"f1" is not an element, surface or component/);
  await assert.rejects(bld(root, 'pager', pagerIn({ answer: 'el1' })), /at least 3 parts of the same kind/);
  await assert.rejects(bld(root, 'pager', pagerIn({ failure: 'cancel_trip' })), /identifier-only answer in failure/);
  const code = pagerIn(); code.logs[1] = 'src/api/trips.ts';
  await assert.rejects(bld(root, 'pager', code), /identifier-only answer in logs\[1\]/);
});

// ---- fix round: reasons obfuscated, blast radius never truncates, role text checked

test('reasons are obfuscated: quiz option why, spot-the-lie statement why, whos-allowed card why', async () => {
  const root = await setup();
  const q = await bld(root, 'quiz', quiz());
  const rq = loadRound(root, q.id);
  rq.questions.forEach((x) => x.options.forEach((o) => { assert.notEqual(o.why, 'Because of the product rule.'); assert.equal(core.decode(o.why), 'Because of the product rule.'); }));
  const l = loadRound(root, (await bld(root, 'spot-the-lie', lie())).id);
  l.statements.forEach((s, i) => { assert.ok(!/^Reason/.test(s.why)); assert.equal(core.decode(s.why), `Reason ${i} in plain words`); });
  const w = loadRound(root, (await bld(root, 'whos-allowed', perm())).id);
  w.cards.forEach((c) => { assert.ok(!/^Rule/.test(c.why)); assert.match(core.decode(c.why), /^Rule \d+ in plain words$/); });
  assert.ok(!readFileSync(join(root, '.own-it', 'data', `${q.id}.js`), 'utf8').includes('product rule'));
});

test('whos-allowed: identifier-only roles are rejected too', async () => {
  const root = await setup();
  const code = perm(); code.cards[3].role = 'role_admin';
  await assert.rejects(bld(root, 'whos-allowed', code), /identifier-only answer in cards\[3\]\.role/);
});

test('blast-radius: more than 8 dependents is refused, an unlabeled dependent is refused, nothing is dropped', async () => {
  const root = await setup();
  const m = loadModel(root);
  const many = Array.from({ length: 9 }, (_, i) => I({ id: `d${i}`, k: 'component', label: `Dependent ${i}` }));
  m.zones.trips.items.push(I({ id: 'core', k: 'component', label: 'Core' }), I({ id: 'free', k: 'component', label: 'Free' }), ...many,
    ...many.map((d, i) => I({ id: `de${i}`, k: 'edge', from: d.id, to: 'core' })));
  saveModel(root, m);
  await assert.rejects(bld(root, 'blast-radius', { zone: 'trips', target: 'core' }), /blast radius too large \(9 parts\); pick a smaller target/);
  const m2 = loadModel(root);
  m2.zones.trips.items = m2.zones.trips.items.filter((x) => !['d7', 'd8', 'de7', 'de8'].includes(x.id));
  delete m2.zones.trips.items.find((x) => x.id === 'd0').label;
  saveModel(root, m2);
  await assert.rejects(bld(root, 'blast-radius', { zone: 'trips', target: 'core' }), /dependents without labels: d0/);
  assert.ok(!existsSync(join(root, '.own-it', 'data')) || !readdirSync(join(root, '.own-it', 'data')).some((f) => f.includes('blast')), 'nothing written');
  const m3 = loadModel(root);
  m3.zones.trips.items.find((x) => x.id === 'd0').label = 'Dependent 0';
  saveModel(root, m3);
  const r = loadRound(root, (await bld(root, 'blast-radius', { zone: 'trips', target: 'core' })).id);
  assert.equal(core.decode(r.answer).length, 7, 'all seven dependents are in the damage set');
});

// ---- v2.2 pack 2: data-detective, pipe-plumber, what-if

async function lifeSetup() {
  const root = await setup();
  const m = loadModel(root);
  m.zones.trips.items.push(
    I({ id: 'st1', k: 'state', label: 'Requested' }), I({ id: 'st2', k: 'state', label: 'Active' }), I({ id: 'st3', k: 'state', label: 'Done' }),
    I({ id: 'st4', k: 'state', label: 'Paid' }),
    I({ id: 'r1', k: 'role', label: 'Rider' }), I({ id: 'r2', k: 'role', label: 'Driver' }), I({ id: 'r3', k: 'role', label: 'Admin' }),
    I({ id: 'tr1', k: 'transition', from: 'st1', to: 'st2', by: 'r2' }), I({ id: 'tr2', k: 'transition', from: 'st2', to: 'st3', by: 'r2' }),
    I({ id: 'tr3', k: 'transition', from: 'st3', to: 'st4', by: 'Payment webhook' }));
  saveModel(root, m);
  return root;
}
const life = (over = {}) => ({ zone: 'trips', entity: 'A trip', states: [{ state: 'st1' }, { state: 'st2' }, { state: 'st3' }], ...over });

test('data-detective: cards shuffled, order and movers only in the obfuscated answer, roles padded and shuffled, labels', async () => {
  const root = await lifeSetup();
  const out = await bld(root, 'data-detective', life());
  const r = loadRound(root, out.id);
  assert.equal(out.id, 'trips-data-detective-1');
  assert.equal(r.states, undefined, 'the ordered input is dropped');
  assert.deepEqual(core.decode(r.answer), { order: ['st1', 'st2', 'st3'], by: ['r2', 'r2'] });
  assert.deepEqual(r.cards.map((c) => c.id).sort(), ['st1', 'st2', 'st3']);
  assert.equal(r.entity, 'A trip');
  assert.ok(r.who.length >= 3 && r.who.some((w) => w.id === 'r2' && w.label === 'Driver'), 'the real mover plus other roles');
  assert.equal(r.labels.st2.label, 'Active');
  assert.equal(r.labels.r2.label, 'Driver');
  const orders = new Set(), whos = new Set();
  for (let k = 0; k < 25; k++) {
    const x = loadRound(root, (await bld(root, 'data-detective', life())).id);
    assert.notDeepEqual(x.cards.map((c) => c.id), ['st1', 'st2', 'st3']);
    orders.add(x.cards.map((c) => c.id).join());
    whos.add(x.who.map((w) => w.id).join());
  }
  assert.ok(orders.size > 1 && whos.size > 1, 'card and role order are shuffled');
  const sess = readJson(join(root, '.own-it', 'session.json')).rounds[out.id];
  assert.equal(sess.rung, 'trace');
});

test('data-detective: a mover that is not a role is shown as written', async () => {
  const root = await lifeSetup();
  const r = loadRound(root, (await bld(root, 'data-detective', life({ states: [{ state: 'st2' }, { state: 'st3' }, { state: 'st4' }] }))).id);
  assert.deepEqual(core.decode(r.answer).by, ['r2', 'Payment webhook']);
  assert.ok(r.who.some((w) => w.id === 'Payment webhook' && w.label === 'Payment webhook'));
});

test('data-detective: missing transitions, repeats, non-states and identifier-only text are rejected before any write', async () => {
  const root = await lifeSetup();
  await assert.rejects(bld(root, 'data-detective', life({ states: [{ state: 'st1' }, { state: 'st3' }, { state: 'st4' }] })), /no transition from "st1" to "st3"/);
  await assert.rejects(bld(root, 'data-detective', life({ states: [{ state: 'st1' }, { state: 'st2' }, { state: 'st1' }] })), /duplicate states/);
  await assert.rejects(bld(root, 'data-detective', life({ states: [{ state: 'st1' }, { state: 'st2' }, { state: 's1' }] })), /"s1" is not a state/);
  await assert.rejects(bld(root, 'data-detective', life({ states: [{ state: 'st1' }, { state: 'st2' }, { state: 'zzz' }] })), /ids not in zone/);
  await assert.rejects(bld(root, 'data-detective', life({ states: [{ state: 'st1' }, { state: 'st2' }] })), /at least 3/);
  await assert.rejects(bld(root, 'data-detective', life({ entity: 'trip_row' })), /identifier-only answer in entity/);
  const m = loadModel(root);
  m.zones.trips.items.find((x) => x.id === 'tr3').by = 'payment_webhook';
  saveModel(root, m);
  await assert.rejects(bld(root, 'data-detective', life({ states: [{ state: 'st2' }, { state: 'st3' }, { state: 'st4' }] })), /identifier-only answer in a transition "by"/);
  delete m.zones.trips.items.find((x) => x.id === 'st2').label;
  saveModel(root, m);
  await assert.rejects(bld(root, 'data-detective', life()), /"st2" has no label/);
  assert.ok(!existsSync(join(root, '.own-it', 'data')) || readdirSync(join(root, '.own-it', 'data')).length === 0, 'nothing written');
});

const dialIn = (n = 3) => ({ zone: 'trips', dials: Array.from({ length: n }, (_, i) => ({
  label: `Traffic grows tenfold at step ${i}`, options: ['The database pool', 'The map service', 'The login page', 'The push sender'], answer: 0, why: `Reason ${i} in plain words` })) });

test('what-if: options permuted per dial, answer remapped and obfuscated, reasons obfuscated, no ids needed', async () => {
  const root = await setup();
  const seen = new Set();
  for (let k = 0; k < 20; k++) {
    const out = await bld(root, 'what-if', dialIn(4));
    const r = loadRound(root, out.id);
    if (k === 0) assert.equal(out.id, 'trips-what-if-1');
    assert.equal(r.dials.length, 4);
    r.dials.forEach((d, i) => {
      assert.equal(typeof d.answer, 'string');
      assert.equal(d.options[core.decode(d.answer)], 'The database pool', 'the answer follows its option');
      assert.ok(!/^Reason/.test(d.why));
      assert.equal(core.decode(d.why), `Reason ${i} in plain words`);
      assert.deepEqual([...d.options].sort(), ['The database pool', 'The login page', 'The map service', 'The push sender']);
      seen.add(core.decode(d.answer));
    });
  }
  assert.ok(seen.size > 1, 'the right option does not stay at the written index');
  assert.equal(readJson(join(root, '.own-it', 'session.json')).rounds['trips-what-if-1'].rung, 'break');
});

test('what-if: wrong counts, bad answers, repeated options and identifier-only text are rejected', async () => {
  const root = await setup();
  await assert.rejects(bld(root, 'what-if', dialIn(2)), /at least 3/);
  await assert.rejects(bld(root, 'what-if', dialIn(6)), /at most 5/);
  const a = dialIn(); a.dials[1].answer = 4;
  await assert.rejects(bld(root, 'what-if', a), /above 3/);
  const b = dialIn(); b.dials[0].options = b.dials[0].options.slice(0, 3);
  await assert.rejects(bld(root, 'what-if', b), /at least 4/);
  const c = dialIn(); c.dials[2].options[1] = 'the database pool ';
  await assert.rejects(bld(root, 'what-if', c), /duplicate option in dials\[2\]\.options\[1\]/);
  const d = dialIn(); d.dials[0].options[3] = 'trips_table';
  await assert.rejects(bld(root, 'what-if', d), /identifier-only answer in dials\[0\]\.options\[3\]/);
  const e = dialIn(); e.dials[1].label = 'src/api/trips.ts';
  await assert.rejects(bld(root, 'what-if', e), /identifier-only answer in dials\[1\]\.label/);
});

async function pipeSetup() {
  const root = await setup();
  const m = loadModel(root);
  m.zones.trips.items.push(I({ id: 'c1', k: 'component', label: 'Trip service' }), I({ id: 'c2', k: 'component', label: 'Trip database' }),
    I({ id: 'c3', k: 'component', label: 'Map service' }), I({ id: 'fp', k: 'flow', label: 'Cancel a trip', steps: [['s1'], ['c1'], ['c2']] }));
  saveModel(root, m);
  return root;
}
const SIDE = [-4, 1, 4, -1];

// Independent re-implementation of the water flow, over the whole grid: does the water from start reach end?
function reaches(r) {
  const open = (t) => ({ cap: [0], straight: [0, 2], corner: [0, 1], tee: [0, 1, 3] }[t.type]).map((d) => (d + t.rot) % 4);
  const { cols } = r.grid;
  const seen = new Set([r.start]);
  for (const i of seen) {
    open(r.tiles[i]).forEach((d) => {
      if ((d === 1 && i % cols === cols - 1) || (d === 3 && i % cols === 0)) return;
      const j = i + SIDE[d];
      if (j < 0 || j >= r.tiles.length || seen.has(j) || !open(r.tiles[j]).includes((d + 2) % 4)) return;
      seen.add(j);
    });
  }
  return seen.has(r.end);
}

test('pipe-plumber: a real path on the grid, solvable, never connected at the start (whole grid), random layout, nothing about the flow in plain data', async () => {
  const root = await pipeSetup();
  const starts = new Set(), turnSets = new Set();
  for (let k = 0; k < 60; k++) {
    const out = await bld(root, 'pipe-plumber', { zone: 'trips', flow: 'fp' });
    const r = loadRound(root, out.id);
    if (k === 0) assert.equal(out.id, 'trips-pipe-plumber-1');
    const ans = core.decode(r.answer);
    assert.deepEqual(ans.names, ['Trip screen', 'Trip service', 'Trip database']);
    assert.equal(r.pathLength, 3);
    assert.equal(r.tiles.length, r.grid.cols * r.grid.rows);
    r.tiles.forEach((t) => assert.deepEqual(Object.keys(t).sort(), ['rot', 'type']));
    const plainJson = JSON.stringify({ ...r, answer: undefined });
    for (const id of ['s1', 'c1', 'c2', 'c3', 'Trip service', 'Trip database', 'Trip screen']) assert.ok(!plainJson.includes(id), `${id} stays out of the plain data`);
    assert.deepEqual(Object.keys(r.labels), ['fp']);
    const cells = ans.cells;
    assert.equal(r.start, cells[0]);
    assert.equal(r.end, cells[2]);
    cells.forEach((c, i) => {
      const dirs = [cells[i - 1], cells[i + 1]].filter((x) => x !== undefined).map((o) => SIDE.indexOf(o - c));
      assert.ok(dirs.every((d) => d >= 0), 'path cells are neighbours on the grid');
      const t = r.tiles[c];
      assert.equal(t.type, dirs.length === 1 ? 'cap' : (dirs[0] + 2) % 4 === dirs[1] ? 'straight' : 'corner', 'the shape fits the path');
    });
    assert.equal(reaches(r), false, 'not connected at the start, spare pipes included');
    starts.add(r.start + ':' + r.end);
    turnSets.add(r.tiles.map((t) => t.rot).join());
    r.tiles.forEach((t) => assert.ok(['cap', 'straight', 'corner', 'tee'].includes(t.type)));
    assert.equal(r.labels.fp.label, 'Cancel a trip');
  }
  assert.ok(starts.size > 1 && turnSets.size > 1, 'path and turns are random');
  assert.deepEqual(readJson(join(root, '.own-it', 'session.json')).rounds['trips-pipe-plumber-1'].cardIds.sort(), ['c1', 'c2', 's1']);
});

test('pipe-plumber: not a flow, wrong ends, one step, too many steps and unlabeled steps are refused before any write', async () => {
  const root = await pipeSetup();
  const m = loadModel(root);
  const add = (...x) => { m.zones.trips.items.push(...x); saveModel(root, m); };
  add(I({ id: 'fa', k: 'flow', label: 'Wrong end', steps: [['s1'], ['c1'], ['s2']] }), I({ id: 'fb', k: 'flow', label: 'Wrong start', steps: [['c1'], ['c2']] }),
    I({ id: 'fc', k: 'flow', label: 'Tiny', steps: [['s1']] }));
  await assert.rejects(bld(root, 'pipe-plumber', { zone: 'trips', flow: 's1' }), /"s1" is not a flow/);
  await assert.rejects(bld(root, 'pipe-plumber', { zone: 'trips', flow: 'fa' }), /must end at a component/);
  await assert.rejects(bld(root, 'pipe-plumber', { zone: 'trips', flow: 'fb' }), /must start at a surface/);
  await assert.rejects(bld(root, 'pipe-plumber', { zone: 'trips', flow: 'fc' }), /at least 2 steps/);
  const long = Array.from({ length: 12 }, (_, i) => I({ id: `x${i}`, k: 'component', label: `Part ${i}` }));
  add(...long, I({ id: 'fl', k: 'flow', label: 'Long', steps: [['s1'], ...long.map((x) => [x.id])] }));
  await assert.rejects(bld(root, 'pipe-plumber', { zone: 'trips', flow: 'fl' }), /has 13 steps; pipe plumber takes 12 at most/);
  delete m.zones.trips.items.find((x) => x.id === 'c1').label;
  saveModel(root, m);
  await assert.rejects(bld(root, 'pipe-plumber', { zone: 'trips', flow: 'fp' }), /steps without labels: c1/);
  assert.ok(!existsSync(join(root, '.own-it', 'data')) || readdirSync(join(root, '.own-it', 'data')).length === 0, 'nothing written');
});

test('pipe-plumber: a 12-step flow still lays out on the grid', async () => {
  const root = await pipeSetup();
  const m = loadModel(root);
  const mid = Array.from({ length: 10 }, (_, i) => I({ id: `x${i}`, k: 'component', label: `Part ${i}` }));
  m.zones.trips.items.push(...mid, I({ id: 'fl', k: 'flow', label: 'Long', steps: [['s1'], ...mid.map((x) => [x.id]), ['c2']] }));
  saveModel(root, m);
  const r = loadRound(root, (await bld(root, 'pipe-plumber', { zone: 'trips', flow: 'fl' })).id);
  assert.equal(core.decode(r.answer).cells.length, 12);
  assert.equal(new Set(core.decode(r.answer).cells).size, 12);
});

const dec = (i = 0) => ({ real: `Queue the work ${i}`, alt: `Do it inline ${i}`, reasons: [`Right reason ${i}`, `Wrong one ${i}a`, `Wrong one ${i}b`, `Wrong one ${i}c`], answer: 0 });
const duelIn = (n = 3) => ({ zone: 'trips', decisions: Array.from({ length: n }, (_, i) => dec(i)) });

test('design-duel: sides and reasons shuffled at build time, the real side and reason only in the obfuscated answer', async () => {
  const root = await setup();
  const sides = new Set(), reasonAt = new Set();
  for (let k = 0; k < 30; k++) {
    const out = await bld(root, 'design-duel', duelIn());
    const r = loadRound(root, out.id);
    if (k === 0) assert.equal(out.id, 'trips-design-duel-1');
    assert.equal(r.decisions.length, 3);
    const seenAt = [];
    r.decisions.forEach((d) => {
      assert.ok(!('real' in d) && !('alt' in d), 'no real/alt keys in the data');
      const a = core.decode(d.answer);
      const i = Number(d[a.side === 0 ? 'a' : 'b'].split(' ').pop());
      seenAt.push(i);
      assert.equal(d[a.side === 0 ? 'a' : 'b'], `Queue the work ${i}`);
      assert.equal(d[a.side === 0 ? 'b' : 'a'], `Do it inline ${i}`);
      assert.equal(d.reasons[a.reason], `Right reason ${i}`);
      assert.deepEqual([...d.reasons].sort(), [`Right reason ${i}`, `Wrong one ${i}a`, `Wrong one ${i}b`, `Wrong one ${i}c`]);
      sides.add(a.side); reasonAt.add(a.reason);
    });
    assert.deepEqual(seenAt.sort(), [0, 1, 2], 'every decision is kept');
  }
  assert.equal(sides.size, 2, 'the real design lands on both sides');
  assert.ok(reasonAt.size > 1, 'the reason does not stay at the written index');
  assert.equal(readJson(join(root, '.own-it', 'session.json')).rounds['trips-design-duel-1'].rung, 'break');
});

test('design-duel: wrong counts, repeats, same design twice, bad answers and identifier-only text are rejected before any write', async () => {
  const root = await setup();
  await assert.rejects(bld(root, 'design-duel', duelIn(2)), /at least 3/);
  const a = duelIn(); a.decisions[1].answer = 4;
  await assert.rejects(bld(root, 'design-duel', a), /above 3/);
  const b = duelIn(); b.decisions[2].reasons[2] = ' right reason 2 ';
  await assert.rejects(bld(root, 'design-duel', b), /duplicate reason in decisions\[2\]\.reasons\[2\]/);
  const c = duelIn(); c.decisions[0].alt = 'queue the work 0';
  await assert.rejects(bld(root, 'design-duel', c), /decisions\[0\]: real and alt are the same design/);
  const d = duelIn(); d.decisions[1].real = 'jobs_queue';
  await assert.rejects(bld(root, 'design-duel', d), /identifier-only answer in decisions\[1\]\.real/);
  const e = duelIn(); e.decisions[0].reasons[3] = 'src/api/trips.ts';
  await assert.rejects(bld(root, 'design-duel', e), /identifier-only answer in decisions\[0\]\.reasons\[3\]/);
  assert.ok(!existsSync(join(root, '.own-it', 'data')) || readdirSync(join(root, '.own-it', 'data')).length === 0, 'nothing written');
});

const roomIn = () => ({ zone: 'trips', puzzles: [
  { kind: 'role', role: 'Rider', action: 'cancel another rider trip', answer: 'deny', why: 'Only the owner may cancel.' },
  { kind: 'flow', flow: 'fp' },
  { kind: 'failure', failure: 'Riders see old prices', logs: ['Cache hit', 'Price stale', 'No refresh', 'Old value sent'], answer: 'c1' },
] });

test('escape-room: one puzzle of each kind, shuffled, flows scrambled, choices derived, every answer and reason obfuscated, labels carried', async () => {
  const root = await pipeSetup();
  const firsts = new Set();
  for (let k = 0; k < 25; k++) {
    const out = await bld(root, 'escape-room', roomIn());
    const r = loadRound(root, out.id);
    if (k === 0) assert.equal(out.id, 'trips-escape-room-1');
    assert.equal(r.puzzles.length, 3);
    assert.deepEqual(r.puzzles.map((p) => p.kind).sort(), ['failure', 'flow', 'role']);
    firsts.add(r.puzzles[0].kind);
    const role = r.puzzles.find((p) => p.kind === 'role'), flow = r.puzzles.find((p) => p.kind === 'flow'), fail = r.puzzles.find((p) => p.kind === 'failure');
    assert.equal(core.decode(role.answer), 'deny');
    assert.equal(core.decode(role.why), 'Only the owner may cancel.');
    assert.notEqual(role.why, 'Only the owner may cancel.');
    assert.deepEqual(core.decode(flow.answer), ['s1', 'c1', 'c2']);
    assert.notDeepEqual(flow.cards.map((c) => c.id), ['s1', 'c1', 'c2']);
    assert.deepEqual(flow.cards.map((c) => c.id).sort(), ['c1', 'c2', 's1']);
    assert.equal(core.decode(fail.answer), 'c1');
    assert.ok(fail.cards.some((c) => c.id === 'c1') && fail.cards.length >= 3 && fail.cards.length <= 4);
    ['s1', 'c1', 'c2', 'fp'].forEach((id) => assert.ok(Object.hasOwn(r.labels, id), `label for ${id}`));
  }
  assert.ok(firsts.size > 1, 'the puzzle order is random');
  assert.equal(readJson(join(root, '.own-it', 'session.json')).rounds['trips-escape-room-1'].rung, 'boss');
});

test('escape-room: missing or repeated kinds, bad ids and identifier-only text are rejected before any write', async () => {
  const root = await pipeSetup();
  const a = roomIn(); a.puzzles[2] = { ...a.puzzles[0] };
  await assert.rejects(bld(root, 'escape-room', a), /one puzzle of each kind/);
  const b = roomIn(); b.puzzles = b.puzzles.slice(0, 2);
  await assert.rejects(bld(root, 'escape-room', b), /at least 3/);
  const c = roomIn(); c.puzzles[1].flow = 's1';
  await assert.rejects(bld(root, 'escape-room', c), /"s1" is not a flow/);
  const d = roomIn(); d.puzzles[1].flow = 'ghost';
  await assert.rejects(bld(root, 'escape-room', d), /ids not in zone "trips": ghost/);
  const e = roomIn(); e.puzzles[2].answer = 'ghost';
  await assert.rejects(bld(root, 'escape-room', e), /ids not in zone "trips": ghost/);
  const f = roomIn(); f.puzzles[0].answer = 'maybe';
  await assert.rejects(bld(root, 'escape-room', f), /role answer must be allow or deny/);
  const g = roomIn(); g.puzzles[0].action = 'cancel_trip';
  await assert.rejects(bld(root, 'escape-room', g), /identifier-only answer in puzzles\[0\]\.action/);
  const h = roomIn(); h.puzzles[2].logs[1] = 'src/cache.ts';
  await assert.rejects(bld(root, 'escape-room', h), /identifier-only answer in puzzles\[2\]\.logs\[1\]/);
  assert.ok(!existsSync(join(root, '.own-it', 'data')) || readdirSync(join(root, '.own-it', 'data')).length === 0, 'nothing written');
});

test('teach-back: names a screen, rung none, label carried; non-screens are refused', async () => {
  const root = await setup();
  const out = await bld(root, 'teach-back', { zone: 'trips', screen: 's1' });
  assert.equal(out.id, 'trips-teach-back-1');
  const r = loadRound(root, out.id);
  assert.equal(r.screen, 's1');
  assert.equal(r.rung, 'none');
  assert.equal(r.labels.s1.label, 'Trip screen');
  assert.deepEqual(readJson(join(root, '.own-it', 'session.json')).rounds[out.id], { game: 'teach-back', zone: 'trips', rung: 'none', mode: 'practice', cardIds: [] });
  await assert.rejects(bld(root, 'teach-back', { zone: 'trips', screen: 'el1' }), /"el1" is not a surface/);
  await assert.rejects(bld(root, 'teach-back', { zone: 'trips', screen: 'ghost' }), /ids not in zone "trips": ghost/);
});

test('build-round stores the stored level on the round and the session entry', async () => {
  const root = await setup();
  const p = loadProgress(root);
  p.settings.level = 'custom';
  p.settings.levelAbout = 'I know React';
  saveProgress(root, p);
  const out = await build({ _: ['quiz', put(root, quiz())], flags: {} }, ctx(root));
  const session = readJson(join(root, '.own-it', 'session.json'));
  assert.equal(session.rounds[out.id].level, 'custom');
  assert.equal(session.rounds[out.id].about, 'I know React');
  assert.match(readFileSync(join(root, '.own-it', 'data', `${out.id}.js`), 'utf8'), /"level": ?"custom"/);
});
