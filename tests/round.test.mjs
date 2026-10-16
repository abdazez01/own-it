import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { run as init } from '../own-it/scripts/lib/cmd-init.mjs';
import { run as build } from '../own-it/scripts/lib/cmd-build-round.mjs';
import { run as apply } from '../own-it/scripts/lib/cmd-apply.mjs';
import { loadModel, saveModel } from '../own-it/scripts/lib/model.mjs';
import { loadProgress } from '../own-it/scripts/lib/progress.mjs';
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
    I({ id: 'el1', k: 'element', on: 's1', does: 'Cancel a trip', goes: 's2' }),
    I({ id: 'el2', k: 'element', on: 's2', does: 'Approve the refund', goes: 's1' }),
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
  return JSON.parse(JSON.stringify(sb.window.OWNIT_ROUND));
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
  assert.deepEqual(readJson(join(root, '.own-it', 'session.json')).round, { id: 'trips-quiz-1', game: 'quiz', zone: 'trips', rung: 'words' });
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
  assert.deepEqual(path.map((p) => p.does), ['Cancel a trip', 'Approve the refund']);
  assert.deepEqual(path.map((p) => p.element), ['el1', 'el2']);
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
    round: { id: 'trips-teach-back-1', game: 'teach-back', zone: 'trips', rung: 'none' } });
  answered(root, 'trips-teach-back-1', { got: 1, of: 1 });
  const out = await apply({ _: ['trips-teach-back-1'], flags: { curiosity: '2' } }, ctx(root));
  assert.equal(out.xp, 10);
  assert.deepEqual(out.cleared, []);
});
