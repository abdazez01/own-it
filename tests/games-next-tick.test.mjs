import { test, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createEnv } from './fake-dom.mjs';
import { run as init } from '../own-it/scripts/lib/cmd-init.mjs';
import { run as build } from '../own-it/scripts/lib/cmd-build-round.mjs';
import { loadModel, saveModel } from '../own-it/scripts/lib/model.mjs';
import { readJson } from '../own-it/scripts/lib/json.mjs';
import { getGame, GAMES_DIR } from '../own-it/scripts/lib/games.mjs';
import { check, loadSchema } from '../own-it/scripts/lib/validate.mjs';
import { tmpProject, ctx } from './helpers.mjs';

const require = createRequire(import.meta.url);
const core = require('../own-it/assets/core.js');
const ASSETS = new URL('../own-it/assets/', import.meta.url);
const FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js', 'gamekit.js', 'screenhost.js'];

// ------------------------------------------------------------------ build-round

const I = (o) => ({ conf: 'high', ref: 'api/t.ts:1', ...o });
async function setup() {
  const root = tmpProject({ 'api/t.ts': 'x\n' });
  writeFileSync(join(root, 'zones.json'), JSON.stringify({ zones: [{ id: 'trips', name: 'Trips', paths: ['api'] }] }));
  await init({ _: [], flags: { zones: join(root, 'zones.json') } }, ctx(root));
  const m = loadModel(root);
  m.zones.trips.items = [
    I({ id: 's1', k: 'surface', label: 'Approvals screen', ref: 'web/approve.tsx:12' }),
    I({ id: 'c1', k: 'component', label: 'Approve handler', ref: 'api/approve.ts:40' }),
    I({ id: 'c2', k: 'component', label: 'Refund check', ref: 'api/refund.ts:77' }),
    I({ id: 'c3', k: 'component', label: 'Trip table', ref: 'api/trips.ts:15' }),
    I({ id: 'f1', k: 'flow', label: 'approve a trip', steps: [['s1'], ['c1'], ['c2'], ['c3']] }),
    I({ id: 'f2', k: 'flow', label: 'one step', steps: [['s1']] }),
  ];
  saveModel(root, m);
  return root;
}

const tick = (n, answer, changes, step) => ({
  options: [0, 1, 2, 3].map((k) => ({ text: `Outcome ${k} of tick ${n}`, why: `Reason ${k} for tick ${n} in words` })),
  answer, changes, step,
});
const input = (over = {}) => ({
  zone: 'trips', mode: 'practice', flow: 'f1',
  start: { entity: 'Manager taps Approve on a trip that has a cancel request', fields: { Status: 'Cancel requested', Refund: 0, Seats: 3 } },
  ticks: [
    tick(1, 2, { Status: 'Approving' }, 's1'),
    tick(2, 0, { Seats: 2 }, 'c1'),
    tick(3, 3, { Refund: 40 }, 'c2'),
    tick(4, 1, { Status: 'Cancelled' }, 'c3'),
  ],
  ...over,
});
const put = (root, obj) => { const p = join(root, 'in.json'); writeFileSync(p, JSON.stringify(obj)); return p; };
const bld = (root, obj, flags = {}) => build({ _: ['next-tick', put(root, obj)], flags }, ctx(root));
const loadRound = (root, id) => {
  const sb = { window: {} };
  vm.runInNewContext(readFileSync(join(root, '.own-it', 'data', `${id}.js`), 'utf8'), sb);
  return JSON.parse(JSON.stringify(sb.window.OWNIT_ROUNDS[id]));
};
const src = (root, id) => readFileSync(join(root, '.own-it', 'data', `${id}.js`), 'utf8');

test('next-tick: meta, schema and shape', () => {
  const meta = getGame('next-tick');
  assert.equal(meta.rung, 'trace');
  assert.equal(meta.stage, '2.0');
  assert.match(meta.logo, /^<svg viewBox="0 0 24 24">/);
  assert.equal((meta.logo.match(/#E8C26A/g) || []).length, 1, 'one gold accent stroke');
  const schema = loadSchema(join(GAMES_DIR, 'next-tick.schema.json'));
  assert.deepEqual(check(input(), schema), []);
  assert.match(check(input({ ticks: input().ticks.slice(0, 3) }), schema).join(), /at least 4/);
  assert.match(check(input({ ticks: [...input().ticks, ...input().ticks] }), schema).join(), /at most 6/);
  const bad = input(); bad.ticks[0].options.pop();
  assert.match(check(bad, schema).join(), /at least 4/);
  const bad2 = input(); bad2.ticks[0].answer = 4;
  assert.match(check(bad2, schema).join(), /above 3/);
});

test('next-tick: nothing readable in the data file, answers decode to the right option, refs from the model', async () => {
  const root = await setup();
  const out = await bld(root, input());
  assert.equal(out.id, 'trips-next-tick-1');
  const text = src(root, out.id);
  for (const secret of ['api/approve.ts:40', 'api/refund.ts:77', 'web/approve.tsx:12', 'api/trips.ts:15', 'Reason 0 for tick 1', 'Reason 3 for tick 3', 'Approving', 'Cancelled']) {
    assert.ok(!text.includes(secret), `${secret} must not be plain`);
  }
  const r = loadRound(root, out.id);
  assert.equal(r.game, 'next-tick');
  assert.equal(r.ticks.length, 4);
  const wantRef = ['web/approve.tsx:12', 'api/approve.ts:40', 'api/refund.ts:77', 'api/trips.ts:15'];
  const wantRight = [2, 0, 3, 1];
  r.ticks.forEach((t, i) => {
    assert.equal(typeof t.answer, 'string');
    assert.equal(typeof t.changes, 'string');
    assert.equal(core.decode(t.ref), wantRef[i]);
    assert.equal(t.options.length, 4);
    assert.ok(t.options.every((o) => typeof o.why === 'string' && !o.why.includes('Reason')), 'whys encoded');
    assert.equal(t.options[core.decode(t.answer)].text, `Outcome ${wantRight[i]} of tick ${i + 1}`, 'shuffled but the answer follows the right option');
    assert.equal(t.hl, undefined);
    assert.equal(t.value, undefined);
  });
  assert.deepEqual(core.decode(r.ticks[2].changes), { Refund: 40 });
  assert.deepEqual(r.start.fields, { Status: 'Cancel requested', Refund: 0, Seats: 3 });
  assert.equal(r.labels.c1.label, 'Approve handler');
  const sess = readJson(join(root, '.own-it', 'session.json')).rounds[out.id];
  assert.equal(sess.rung, 'trace');
  assert.deepEqual(sess.cardIds, ['s1', 'c1', 'c2', 'c3']);
});

test('next-tick: options are shuffled so the written position gives nothing away', async () => {
  const root = await setup();
  const seen = new Set();
  for (let k = 0; k < 20; k++) seen.add(core.decode(loadRound(root, (await bld(root, input())).id).ticks[0].answer));
  assert.ok(seen.size > 1);
});

test('next-tick: levels scale the options, the highlight and the exact-value tick', async () => {
  const root = await setup();
  const easy = loadRound(root, (await bld(root, input(), { level: 'easy' })).id);
  assert.equal(easy.level, 'easy');
  easy.ticks.forEach((t, i) => {
    assert.equal(t.options.length, 3);
    assert.ok(core.decode(t.answer) < 3);
    assert.deepEqual(t.hl, Object.keys(core.decode(t.changes)));
    assert.equal(t.options[core.decode(t.answer)].text, `Outcome ${[2, 0, 3, 1][i]} of tick ${i + 1}`);
  });
  for (const level of ['medium', 'hard']) {
    const r = loadRound(root, (await bld(root, input(), { level })).id);
    assert.ok(r.ticks.every((t) => t.options.length === 4 && t.hl === undefined && t.value === undefined), level);
  }
  const imp = loadRound(root, (await bld(root, input(), { level: 'impossible' })).id);
  const withValue = imp.ticks.filter((t) => t.value);
  assert.equal(withValue.length, 1, 'exactly one exact-value tick');
  const v = withValue[0].value;
  assert.equal(v.field, 'Refund', 'the last numeric change is asked for');
  assert.equal(v.options.length, 4);
  assert.equal(new Set(v.options).size, 4);
  assert.equal(v.options[core.decode(v.answer)], '40');
  assert.ok(v.options.every((o) => /^\d+$/.test(o)), 'numeric options, none negative');
  assert.equal(typeof v.answer, 'string');
  const custom = loadRound(root, (await bld(root, input(), { level: 'custom', base: 'impossible', about: 'I wrote it' })).id);
  assert.equal(custom.ticks.filter((t) => t.value).length, 1, 'custom plays at its base');
});

test('next-tick: a state value is asked for when no number changes', async () => {
  const root = await setup();
  const inp = input({ start: { entity: 'Manager approves a trip', fields: { Status: 'Cancel requested', Owner: 'Manager' } },
    ticks: [tick(1, 0, { Status: 'Approving' }, 's1'), tick(2, 1, { Owner: 'Payments' }, 'c1'), tick(3, 2, { Status: 'Refunded' }, 'c2'), tick(4, 3, { Status: 'Cancelled' }, 'c3')] });
  const r = loadRound(root, (await bld(root, inp, { level: 'impossible' })).id);
  const v = r.ticks.find((t) => t.value).value;
  assert.equal(v.field, 'Status');
  assert.equal(v.options[core.decode(v.answer)], 'Cancelled');
  assert.equal(new Set(v.options).size, 4);
});

test('next-tick: bad steps, fields, words and flows are rejected before any write', async () => {
  const root = await setup();
  const bad = (over, re) => assert.rejects(bld(root, over), re);
  await bad(input({ ticks: input().ticks.slice(0, 3) }), /at least 4/);
  const ghost = input(); ghost.ticks[1].step = 'zzz';
  await bad(ghost, /ids not in zone/);
  const outside = input(); outside.ticks[1].step = 's2';
  await bad(outside, /ids not in zone/);
  const notInFlow = input(); notInFlow.ticks[1].step = 'f2';
  await bad(notInFlow, /not a step of flow "f1"/);
  const backwards = input(); backwards.ticks[2].step = 's1';
  await bad(backwards, /comes before the previous tick/);
  const noField = input(); noField.ticks[0].changes = { Colour: 'Red' };
  await bad(noField, /ticks\[0\]\.changes\.Colour: not a field/);
  const same = input(); same.ticks[0].changes = { Status: 'Cancel requested' };
  await bad(same, /same value as before/);
  const empty = input(); empty.ticks[0].changes = {};
  await bad(empty, /at least one field changes/);
  const idText = input(); idText.ticks[0].options[1].text = 'trip_status';
  await bad(idText, /identifier-only answer in ticks\[0\]\.options\[1\]\.text/);
  const idWhy = input(); idWhy.ticks[2].options[0].why = 'src/trips/approve.ts';
  await bad(idWhy, /identifier-only answer in ticks\[2\]\.options\[0\]\.why/);
  const dup = input(); dup.ticks[0].options[1].text = dup.ticks[0].options[0].text;
  await bad(dup, /duplicate option/);
  await bad(input({ start: { entity: 'trip_row', fields: { A: 1 } } }), /identifier-only answer in start\.entity/);
  await bad(input({ start: { entity: 'A trip', fields: { trip_status: 'x' } } }), /identifier-only answer in start\.fields name/);
  await bad(input({ start: { entity: 'A trip', fields: { Status: 'cancel_requested' } } }), /identifier-only answer in start\.fields\.Status/);
  await bad(input({ flow: 's1' }), /"s1" is not a flow/);
  await bad(input({ flow: 'f2' }), /at least 2 steps/);
  await bad(input({ flow: 'nope' }), /ids not in zone/);
  const noAnswer = input(); delete noAnswer.ticks[3].answer;
  await bad(noAnswer, /missing answer in ticks\[3\]/);
  assert.ok(!existsSync(join(root, '.own-it', 'data')) || readdirSync(join(root, '.own-it', 'data')).length === 0, 'nothing written');
});

// ------------------------------------------------------------------ play

const REAL_RANDOM = Math.random;
const live = [];
after(() => { live.forEach((f) => { try { f(); } catch { /* already cleaned */ } }); Math.random = REAL_RANDOM; });

function boot(round, { link } = {}) {
  Math.random = () => 0;
  const env = createEnv({ reduced: true });
  env.load(...FILES);
  const w = env.window;
  w.TextDecoder = TextDecoder;
  vm.runInContext(readFileSync(new URL('core.js', ASSETS), 'utf8'), env.ctx, { filename: 'core.js' });
  let decodes = 0;
  const real = w.OwnItCore.decode;
  w.OwnItCore.decode = (s) => { decodes++; return real(s); };
  const sounds = [];
  w.OwnIt.audio = { play: (n, a) => sounds.push(a === undefined ? n : [n, a]) };
  let shakes = 0;
  w.OwnIt.juice.shake = () => { shakes++; };
  let confetti = 0;
  w.OwnIt.juice.confetti = () => { confetti++; };
  const results = [];
  vm.runInContext(readFileSync(new URL('games/next-tick.js', ASSETS), 'utf8'), env.ctx, { filename: 'next-tick.js' });
  w.OwnIt.resultCard = (c, r) => { results.push(r); if (r.payload) c.finish(r.payload); return { sent: true }; };
  const root = env.document.createElement('div');
  env.document.body.appendChild(root);
  const finished = [];
  const c = {
    game: 'next-tick', roundId: 'trips-next-tick-1', root, router: { go() {} }, toast() {},
    keys: { on: (k, f) => w.OwnIt.keys.on(k, f, 'next-tick') },
    finish: (p) => finished.push(p), link,
  };
  w.OwnIt.keys.setScope('next-tick');
  const cleanup = w.OwnIt.games.get('next-tick').play(root, round, c);
  live.push(cleanup);
  const key = (k) => env.document.dispatchEvent(env.event('keydown', { key: k }));
  return { env, w, root, key, sounds, finished, results, cleanup, confetti: () => confetti, decodes: () => decodes, shakes: () => shakes };
}

const all = (t, sel) => Array.from(t.root.querySelectorAll(sel));
const tuples = (t, name) => t.sounds.filter((s) => Array.isArray(s) && s[0] === name);
const plain = (x) => JSON.parse(JSON.stringify(x));
const opts = (t) => all(t, '.answer');
const row = (t, field) => all(t, '.nt-row').find((r) => r.querySelector('.nt-field').textContent === field);
const val = (t, field) => row(t, field).querySelector('.nt-val').getAttribute('aria-label');

// Right answers are at index 1, 0, 3, 2 so the keys differ per tick.
const RIGHT = [1, 0, 3, 2];
const ntRound = (over = {}) => ({
  zone: 'trips', mode: 'practice', flow: 'f1', labels: { f1: { label: 'approve a trip' } },
  start: { entity: 'Manager taps Approve on a trip', fields: { Status: 'Requested', Refund: 0, Seats: 3 } },
  ticks: [
    { changes: { Status: 'Approving' }, step: 's1', ref: 'web/approve.tsx:12' },
    { changes: { Seats: 2 }, step: 'c1', ref: 'api/approve.ts:40' },
    { changes: { Refund: 40 }, step: 'c2', ref: 'api/refund.ts:77' },
    { changes: { Status: 'Cancelled' }, step: 'c3', ref: 'api/trips.ts:15' },
  ].map((x, i) => ({
    options: [0, 1, 2, 3].map((k) => ({ text: `Outcome ${k} of tick ${i + 1}`, why: core.encode(`Reason ${k} for tick ${i + 1}`) })),
    answer: core.encode(RIGHT[i]), changes: core.encode(x.changes), ref: core.encode(x.ref), step: x.step,
  })),
  ...over,
});
const finishRound = (t) => { for (let i = 0; i < 4; i++) { t.key(String((RIGHT[i]) + 1)); t.key('Enter'); } t.key('Enter'); };

test('next-tick play: the scene shows the state table, nothing is decoded before an answer', () => {
  const t = boot(ntRound());
  assert.match(t.root.textContent, /Manager taps Approve on a trip/);
  assert.equal(all(t, '.nt-row').length, 3);
  assert.equal(val(t, 'Status'), 'Requested');
  assert.equal(val(t, 'Refund'), '0');
  assert.equal(opts(t).length, 4);
  assert.match(t.root.textContent, /How to play/);
  assert.equal(t.decodes(), 0);
  assert.ok(all(t, '.nt-row.hl').length === 0, 'no highlight on medium');
  assert.ok(!t.root.textContent.includes('web/approve.tsx'), 'the code line is hidden until an answer');
});

test('next-tick play: a right pick flips the changed field, shows why and the code line, then Enter goes on', () => {
  const t = boot(ntRound());
  t.key('2'); // right
  assert.equal(val(t, 'Status'), 'Approving', 'changed field flipped');
  assert.equal(val(t, 'Seats'), '3', 'other fields stay');
  assert.ok(row(t, 'Status').classList.contains('changed'));
  assert.ok(!row(t, 'Seats').classList.contains('changed'));
  assert.match(t.root.textContent, /Reason 1 for tick 1/);
  assert.match(t.root.textContent, /\+10 XP/);
  assert.equal(all(t, 'code.nt-code')[0].textContent, 'web/approve.tsx:12');
  assert.ok(opts(t)[1].classList.contains('right'));
  assert.equal(tuples(t, 'combo').length, 1);
  t.key('3'); // locked: ignored
  assert.equal(val(t, 'Status'), 'Approving');
  assert.equal(all(t, '.nt-q')[0].textContent.startsWith('Tick 1 of 4'), true);
  t.key('Enter');
  assert.equal(all(t, '.nt-q')[0].textContent.startsWith('Tick 2 of 4'), true);
  assert.equal(all(t, '.nt-row.changed').length, 0, 'the flip mark is cleared on the next tick');
  assert.equal(all(t, 'code.nt-code').length, 0, 'feedback cleared');
});

test('next-tick play: Enter on a focused outcome picks it, A to D do nothing, 5 does nothing', () => {
  const t = boot(ntRound());
  t.key('a'); t.key('5');
  assert.equal(val(t, 'Status'), 'Requested');
  const btn = opts(t)[1];
  btn.focus();
  t.env.document.dispatchEvent(t.env.event('keydown', { key: 'Enter', target: btn }));
  assert.equal(val(t, 'Status'), 'Approving');
});

test('next-tick play: a perfect run earns 10 plus a streak bonus per tick, a timeline and confetti', () => {
  const t = boot(ntRound());
  finishRound(t);
  assert.equal(t.finished.length, 1);
  assert.equal(t.finished[0].game, 'next-tick');
  assert.equal(t.finished[0].got, 4);
  assert.equal(t.finished[0].of, 4);
  assert.equal(t.results[0].xp, 10 + 12 + 14 + 16);
  assert.deepEqual(plain(t.finished[0].missed), []);
  assert.equal(t.confetti(), 1);
  assert.equal(t.shakes(), 0);
});

test('next-tick play: the end screen is a timeline with every outcome, why and code line', () => {
  const t = boot(ntRound());
  for (let i = 0; i < 4; i++) { t.key(String(RIGHT[i] + 1)); t.key('Enter'); }
  assert.equal(t.finished.length, 0, 'the timeline comes before the result');
  const steps = all(t, '.nt-step');
  assert.equal(steps.length, 4);
  steps.forEach((s, i) => {
    assert.match(s.textContent, new RegExp(`Outcome ${RIGHT[i]} of tick ${i + 1}`));
    assert.match(s.textContent, new RegExp(`Reason ${RIGHT[i]} for tick ${i + 1}`));
  });
  assert.deepEqual(all(t, 'code.nt-code').map((c) => c.textContent), ['web/approve.tsx:12', 'api/approve.ts:40', 'api/refund.ts:77', 'api/trips.ts:15']);
  assert.ok(steps.every((s) => s.classList.contains('ok')));
  t.key('Enter');
  assert.equal(t.finished.length, 1);
});

test('next-tick play: a wrong pick shakes, shows why not and what happened, breaks the streak and is reviewed with its code line', () => {
  const t = boot(ntRound());
  t.key('2'); t.key('Enter');           // right, streak 1
  t.key('4');                           // wrong: right is 1
  assert.equal(t.shakes(), 1);
  assert.ok(opts(t)[3].classList.contains('wrong'));
  assert.ok(opts(t)[0].classList.contains('right'));
  assert.match(t.root.textContent, /Why not:/);
  assert.match(t.root.textContent, /Reason 3 for tick 2/);
  assert.match(t.root.textContent, /Reason 0 for tick 2/);
  assert.equal(val(t, 'Seats'), '2', 'the table moves to the true state even on a miss');
  t.key('Enter');
  t.key('4'); t.key('Enter');           // right (tick 3), streak 1 again
  t.key('3'); t.key('Enter'); t.key('Enter');
  assert.equal(t.finished[0].got, 3);
  assert.equal(t.results[0].xp, 10 + 0 + 10 + 12);
  assert.deepEqual(plain(t.finished[0].missed), ['c1']);
  assert.deepEqual(plain(t.finished[0].wrong), [['c1', 'c1']]);
  assert.match(t.results[0].missed[0].text, /Tick 2 of 4: Outcome 0 of tick 2\. Reason 0/);
  assert.equal(t.results[0].missed[0].ref, 'api/approve.ts:40');
  assert.equal(t.confetti(), 0);
});

test('next-tick play: exam mode keeps reasons and code lines for the end', () => {
  const t = boot(ntRound({ mode: 'exam' }));
  t.key('1'); // wrong
  assert.equal(val(t, 'Status'), 'Approving', 'the scene still moves on');
  assert.match(t.root.textContent, /Locked in/);
  assert.ok(!/Reason \d for tick 1/.test(t.root.textContent));
  assert.equal(all(t, 'code.nt-code').length, 0);
  assert.equal(all(t, '.right').length, 0);
  t.key('Enter'); t.key('1'); t.key('Enter'); t.key('4'); t.key('Enter'); t.key('3'); t.key('Enter');
  assert.match(all(t, '.nt-step')[0].textContent, /Reason 1 for tick 1/);
  assert.equal(all(t, 'code.nt-code').length, 4);
});

test('next-tick play: easy lights the changed field and has 3 options', () => {
  const r = ntRound({ level: 'easy' });
  r.ticks.forEach((tk, i) => { tk.options.splice(3, 1); tk.answer = core.encode(Math.min(RIGHT[i], 2)); tk.hl = Object.keys(core.decode(tk.changes)); });
  const t = boot(r);
  assert.equal(opts(t).length, 3);
  assert.deepEqual(all(t, '.nt-row.hl').map((x) => x.querySelector('.nt-field').textContent), ['Status']);
  t.key('4'); // no fourth option
  assert.equal(val(t, 'Status'), 'Requested');
  t.key('2');
  assert.equal(all(t, '.nt-row.hl').length, 0, 'highlight turns into the flip');
  assert.ok(row(t, 'Status').classList.contains('changed'));
});

test('next-tick play: impossible runs a clock per tick and asks one exact value', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const r = ntRound({ level: 'impossible' });
    r.ticks[2].value = { field: 'Refund', options: ['0', '10', '40', '80'], answer: core.encode(2) };
    const t = boot(r);
    assert.equal(all(t, '.cr-fuse').length, 1, 'a clock on tick 1');
    mock.timers.tick(20000); // time runs out: counts as missed
    assert.ok(opts(t)[1].classList.contains('right'));
    assert.match(t.root.textContent, /Time is up/);
    assert.equal(val(t, 'Status'), 'Approving');
    assert.equal(all(t, '.cr-fuse').length, 0, 'the clock is gone while the reason shows');
    t.key('Enter');
    assert.equal(all(t, '.cr-fuse').length, 1, 'a fresh clock');
    t.key('1'); t.key('Enter');
    assert.match(all(t, '.nt-q')[0].textContent, /exact new value of Refund/);
    assert.deepEqual(opts(t).map((o) => o.textContent.replace(/^\d/, '')), ['0', '10', '40', '80']);
    t.key('3');
    assert.equal(val(t, 'Refund'), '40');
    assert.match(t.root.textContent, /\+12 XP/);
    t.key('Enter');
    t.key('3'); t.key('Enter'); t.key('Enter');
    assert.equal(t.finished[0].got, 3);
    assert.deepEqual(plain(t.finished[0].missed), ['s1']);
  } finally { mock.timers.reset(); }
});

test('next-tick play: on the last tick the player can explain why, sent as an ask event', () => {
  const sent = [];
  const link = { mode: 'live', send: (type, body) => { sent.push([type, body]); return true; }, onData: () => () => {}, onMode: () => () => {} };
  const t = boot(ntRound(), { link });
  for (let i = 0; i < 3; i++) { t.key(String(RIGHT[i] + 1)); t.key('Enter'); }
  assert.equal(t.root.querySelector('.nt-explain').hasAttribute('hidden'), true, 'not before the last tick');
  t.key(String(RIGHT[3] + 1));
  const explain = t.root.querySelector('.nt-explain');
  assert.equal(explain.hasAttribute('hidden'), false);
  const box = t.root.querySelector('textarea.nt-text');
  box.value = 'The approval releases the seat and then pays out the refund.';
  all(t, 'button').find((b) => b.textContent === 'Send my explanation').click();
  assert.deepEqual(plain(sent), [['ask', { round: 'trips-next-tick-1', q: 'q1', text: 'The approval releases the seat and then pays out the refund.' }]]);
  t.key('Enter'); t.key('Enter');
  assert.equal(t.finished.length, 1);
});

test('next-tick play: in file mode the explanation goes into the result text', () => {
  const t = boot(ntRound());
  for (let i = 0; i < 3; i++) { t.key(String(RIGHT[i] + 1)); t.key('Enter'); }
  t.key(String(RIGHT[3] + 1));
  t.root.querySelector('textarea.nt-text').value = 'Because the refund is owed.';
  all(t, 'button').find((b) => b.textContent === 'Send my explanation').click();
  t.key('Enter'); t.key('Enter');
  assert.equal(t.finished[0].text.q1, 'Because the refund is owed.');
});

test('next-tick play: a malformed round and cleanup', () => {
  assert.throws(() => boot({ zone: 'trips', ticks: [], start: { entity: 'x', fields: {} } }), /cannot be played/);
  assert.throws(() => boot({ zone: 'trips', start: { entity: 'x', fields: {} }, ticks: [{ options: [] }] }), /cannot be played/);
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const t = boot(ntRound({ level: 'impossible' }));
    t.cleanup();
    mock.timers.tick(60000);
    assert.equal(t.finished.length, 0);
  } finally { mock.timers.reset(); }
});
