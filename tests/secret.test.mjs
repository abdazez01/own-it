import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEnv } from './fake-dom.mjs';
import { listGames } from '../own-it/scripts/lib/games.mjs';
import { run as init } from '../own-it/scripts/lib/cmd-init.mjs';
import { run as build } from '../own-it/scripts/lib/cmd-build-round.mjs';
import { run as checkRefs } from '../own-it/scripts/lib/cmd-check-refs.mjs';
import { loadModel, saveModel } from '../own-it/scripts/lib/model.mjs';
import { loadProgress } from '../own-it/scripts/lib/progress.mjs';
import { readJson } from '../own-it/scripts/lib/json.mjs';
import { SECRET_GAMES } from '../own-it/scripts/lib/secret-games.mjs';
import core from '../own-it/scripts/lib/core.mjs';
import { tmpProject, ctx } from './helpers.mjs';

const require = createRequire(import.meta.url);
const coreJs = require('../own-it/assets/core.js');
const ASSETS = new URL('../own-it/assets/', import.meta.url);
const FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js', 'gamekit.js', 'secret.js', 'screenhost.js'];

const live = [];
after(() => live.forEach((f) => { try { f(); } catch { /* already cleaned */ } }));

// ---------------------------------------------------------------- build-round and check-refs

const I = (o) => ({ conf: 'high', ref: 'api/t.ts:1', ...o });
const W = (o) => ({ id: 'w1', kind: 'role', text: 'A driver can approve a cancel.', why: 'The approve endpoint skips the role check.', ref: 'api/t.ts:2', steps: [{ element: 'el2', role: 'r1' }], ...o });

async function setup({ weaknesses = [W()] } = {}) {
  const root = tmpProject({ 'api/t.ts': 'a\nb\nc\nd\n' });
  writeFileSync(join(root, 'zones.json'), JSON.stringify({ zones: [{ id: 'trips', name: 'Trips', paths: ['api'] }] }));
  await init({ _: [], flags: { zones: join(root, 'zones.json') } }, ctx(root));
  const m = loadModel(root);
  m.zones.trips.items = [
    I({ id: 's1', k: 'surface', label: 'Trip screen' }), I({ id: 's2', k: 'surface', label: 'Approvals' }), I({ id: 's9', k: 'surface', label: 'Island' }),
    I({ id: 'r1', k: 'role', label: 'Driver' }), I({ id: 'r2', k: 'role', label: 'Manager' }),
    I({ id: 'el1', k: 'element', on: 's1', does: 'f1', goes: 's2', roles: ['r1'] }),
    I({ id: 'el2', k: 'element', on: 's2', does: 'f1', goes: 's1', roles: ['r2'] }),
    I({ id: 'el8', k: 'element', on: 's9', does: 'f1' }),
    I({ id: 'f1', k: 'flow', label: 'cancel', steps: [['s1'], ['s2']] }),
  ];
  if (weaknesses) m.zones.trips.weaknesses = weaknesses;
  saveModel(root, m);
  return root;
}
const quest = (over = {}) => ({ zone: 'trips', flow: 'f1', goal: 'g', start: 's1', objectives: [{ text: 'a', element: 'el1' }, { text: 'b', element: 'el2' }], ...over });
function put(root, obj) { const p = join(root, 'in.json'); writeFileSync(p, JSON.stringify(obj)); return p; }
const bld = (root, game, obj, flags = { level: 'secret' }) => build({ _: [game, put(root, obj)], flags }, ctx(root));
function loadRound(root, id) {
  const sb = { window: {} };
  vm.runInNewContext(readFileSync(join(root, '.own-it', 'data', `${id}.js`), 'utf8'), sb);
  return JSON.parse(JSON.stringify(sb.window.OWNIT_ROUNDS[id]));
}

test('secret round: goal, level, break rung, kind in plain, weakness obfuscated', async () => {
  const root = await setup();
  const out = await bld(root, 'quests', quest());
  const r = loadRound(root, out.id);
  assert.equal(r.level, 'secret');
  assert.equal(r.rung, 'break');
  assert.equal(r.goal, 'Claude found a way to break this. Find it.');
  assert.equal(r.secret.kind, 'role');
  assert.equal(typeof r.secret.answer, 'string');
  assert.ok(!JSON.stringify(r).includes('api/t.ts:2'), 'ref is not in the data in plain');
  const w = core.decode(r.secret.answer);
  assert.equal(w.ref, 'api/t.ts:2');
  assert.deepEqual(w.steps, [{ element: 'el2', role: 'r1' }]);
  assert.equal(readJson(join(root, '.own-it', 'session.json')).rounds[out.id].rung, 'break');
  assert.equal(r.labels.r1.label, 'Driver');
});

test('secret round: needs a recorded weakness and a quests-like game in SECRET_GAMES', async () => {
  const none = await setup({ weaknesses: null });
  await assert.rejects(bld(none, 'quests', quest()), /no recorded weaknesses/);
  const root = await setup();
  await assert.rejects(bld(root, 'quiz', { zone: 'trips', questions: [] }), /not available for quiz/);
  assert.deepEqual([...SECRET_GAMES], ['quests']);
  await assert.rejects(bld(root, 'quests', quest({ weakness: 'nope' })), /unknown weakness/);
  await assert.rejects(bld(root, 'quests', quest({ weakness: 'w1' }), {}), /needs --level secret/);
});

test('secret round: the weakness must be real on this quest (evidence in the model)', async () => {
  let root = await setup({ weaknesses: [W({ steps: [{ element: 'el2', role: 'r2' }] })] });
  await assert.rejects(bld(root, 'quests', quest()), /role weakness needs/);
  root = await setup({ weaknesses: [W({ steps: [{ element: 'el8', role: 'r1' }] })] });
  await assert.rejects(bld(root, 'quests', quest()), /not on the screens/);
  root = await setup({ weaknesses: [W({ kind: 'double', steps: [{ element: 'el1' }, { element: 'el2' }] })] });
  await assert.rejects(bld(root, 'quests', quest()), /exactly one step/);
  root = await setup({ weaknesses: [W({ kind: 'order', steps: [{ element: 'el1' }] })] });
  await assert.rejects(bld(root, 'quests', quest()), /after the first/);
  root = await setup({ weaknesses: [W({ kind: 'order', steps: [{ element: 'el2' }] })] });
  assert.ok((await bld(root, 'quests', quest())).id);
});

test('check-refs keeps backed weaknesses, drops invented ones, and counts them for the page', async () => {
  const root = await setup({ weaknesses: null });
  const m = loadModel(root);
  m.zones.trips.items = [];
  saveModel(root, m);
  const items = [
    I({ id: 's1', k: 'surface', label: 'Trip screen' }), I({ id: 's2', k: 'surface', label: 'Approvals' }), I({ id: 'f1', k: 'flow', label: 'c', steps: [['s1'], ['s2']] }),
    I({ id: 'r1', k: 'role', label: 'Driver' }), I({ id: 'el2', k: 'element', on: 's2', does: 'f1', roles: ['r1'] }),
  ];
  const p = join(root, 'ex.json');
  writeFileSync(p, JSON.stringify({ zone: 'trips', files: ['api/t.ts'], items, weaknesses: [
    W({ id: 'good' }), W({ id: 'nofile', ref: 'api/none.ts:1' }), W({ id: 'badline', ref: 'api/t.ts:99' }),
    W({ id: 'ghost', steps: [{ element: 'zzz' }] }), W({ id: 'badkind', kind: 'magic' }),
  ] }));
  const out = await checkRefs({ _: [p], flags: {} }, ctx(root));
  assert.deepEqual(loadModel(root).zones.trips.weaknesses.map((w) => w.id), ['good']);
  assert.deepEqual(out.dropped.filter((d) => d.why === 'weakness').map((d) => d.id).sort(), ['badkind', 'badline', 'ghost', 'nofile']);
  assert.equal(loadProgress(root).zones.trips.weaknesses, 1);
});

test('check-refs: a break pass (weaknesses only, empty files and items) leaves the structure model alone', async () => {
  const root = await setup({ weaknesses: [W({ id: 'old' })] });
  const before = loadModel(root).zones.trips;
  const p = join(root, 'break.json');
  writeFileSync(p, JSON.stringify({ zone: 'trips', files: [], items: [], weaknesses: [
    W({ id: 'new', kind: 'double', steps: [{ element: 'el1' }] }), W({ id: 'ghost', steps: [{ element: 'zzz' }] }),
  ] }));
  const out = await checkRefs({ _: [p], flags: {} }, ctx(root));
  const after = loadModel(root).zones.trips;
  assert.deepEqual(after.items, before.items);
  assert.deepEqual(after.files, before.files);
  assert.deepEqual(after.weaknesses.map((w) => w.id), ['old', 'new']);
  assert.deepEqual(out.dropped, [{ id: 'ghost', why: 'weakness' }]);
  assert.equal(out.kept, 0);
});

test('check-refs: a break pass that finds nothing still records 0, so the zone counts as hunted', async () => {
  const root = await setup({ weaknesses: null });
  assert.equal(loadProgress(root).zones.trips.weaknesses, undefined);
  const p = join(root, 'break.json');
  writeFileSync(p, JSON.stringify({ zone: 'trips', files: [], items: [], weaknesses: [] }));
  await checkRefs({ _: [p], flags: {} }, ctx(root));
  assert.equal(loadProgress(root).zones.trips.weaknesses, 0);
  // A structure extraction without a weaknesses array does not mark the zone as hunted.
  const fresh = await setup({ weaknesses: null });
  writeFileSync(join(fresh, 'ex.json'), JSON.stringify({ zone: 'trips', files: [], items: [] }));
  await checkRefs({ _: [join(fresh, 'ex.json')], flags: {} }, ctx(fresh));
  assert.equal(loadProgress(fresh).zones.trips.weaknesses, undefined);
});

// ---------------------------------------------------------------- the module

function bootModule({ reduced = false } = {}) {
  const env = createEnv({ reduced });
  env.load(...FILES);
  const w = env.window;
  const sounds = [];
  w.OwnIt.sound = (n) => sounds.push(n);
  let t = 1000;
  w.OwnIt.secret.now = () => t;
  return { env, w, S: w.OwnIt.secret, sounds, advance: (ms) => { t += ms; }, body: env.document.body };
}
const fire = (el, type) => el.dispatchEvent({ type, bubbles: false, preventDefault() {} });

test('isAvailable: only listed games, only zones with at least one weakness', () => {
  const { S } = bootModule();
  assert.equal(S.isAvailable('quests', { weaknesses: 1 }), true);
  assert.equal(S.isAvailable('quests', { weaknesses: 0 }), false);
  assert.equal(S.isAvailable('quests', {}), false);
  assert.equal(S.isAvailable('quests', null), false);
  assert.equal(S.isAvailable('quiz', { weaknesses: 3 }), false);
});

test('hover scare fires once per entry, with a cooldown, and the tiles settle on SECRET', () => {
  const { S, sounds, advance, body } = bootModule();
  const b = S.option(() => {});
  const label = () => b.querySelector('.flap').getAttribute('aria-label');
  assert.equal(label(), '??????');
  fire(b, 'pointerenter');
  fire(b, 'mouseenter'); // the same hover reports twice: one scare
  fire(b, 'focus');
  assert.deepEqual(sounds.filter((n) => n === 'rumble'), ['rumble']);
  assert.ok(sounds.includes('crackle'));
  assert.ok(body.classList.contains('secret-shake'));
  assert.ok(body.children.some((c) => c.classList.contains('flicker')));
  fire(b, 'pointerleave');
  fire(b, 'pointerenter'); // back in within the cooldown: no second scare
  assert.equal(sounds.filter((n) => n === 'rumble').length, 1);
  fire(b, 'pointerleave');
  advance(S.COOLDOWN + 1);
  fire(b, 'pointerenter');
  assert.equal(sounds.filter((n) => n === 'rumble').length, 2);
});

test('reduced motion: flicker only, no shake, tiles settle at once', () => {
  const { S, body } = bootModule({ reduced: true });
  const b = S.option(() => {});
  fire(b, 'pointerenter');
  assert.ok(!body.classList.contains('secret-shake'));
  assert.ok(body.children.some((c) => c.classList.contains('flicker')));
  assert.equal(b.querySelector('.flap').getAttribute('aria-label'), 'SECRET');
  assert.ok(!b.classList.contains('secret-appear'));
});

test('shatter: reduced motion makes no shards; otherwise clones are used when available', () => {
  const { S, env } = bootModule({ reduced: true });
  const el = env.document.createElement('div');
  env.document.body.appendChild(el);
  let done = 0;
  S.shatter(el, 10, 10, () => { done++; });
  assert.ok(!env.document.body.children.some((c) => c.classList.contains('secret-shard')));
  assert.equal(el.style.opacity, '0');
});

test('triggered: each kind matches only its own pattern', () => {
  const { S } = bootModule();
  const tap = (id, role, t) => ({ id, role, t });
  assert.equal(S.triggered('role', [{ element: 'a', role: 'r1' }], [tap('a', 'r1', 0)]), true);
  assert.equal(S.triggered('role', [{ element: 'a', role: 'r1' }], [tap('a', 'r2', 0)]), false);
  assert.equal(S.triggered('double', [{ element: 'a' }], [tap('a', '', 0), tap('a', '', 399)]), true);
  assert.equal(S.triggered('double', [{ element: 'a' }], [tap('a', '', 0), tap('a', '', 401)]), false);
  assert.equal(S.triggered('input', [{ element: 'a' }, { element: 'b' }], [tap('x', '', 0), tap('a', '', 1), tap('b', '', 2)]), true);
  assert.equal(S.triggered('input', [{ element: 'a' }, { element: 'b' }], [tap('b', '', 2)]), false);
});

// ---------------------------------------------------------------- the picker on Home

const PICK_FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js', 'secret.js', 'home.js'];
function bootHome(weaknesses) {
  const env = createEnv({ reduced: true });
  env.load(...PICK_FILES);
  const w = env.window;
  w.OWNIT_GAMES = listGames();
  w.OWNIT_PROGRESS = { xp: 0, zones: { trips: { name: 'Trips', rungs: { words: 'open', map: 'locked', trace: 'locked', break: 'locked', boss: 'locked' }, claimed: false, fogged: false, weakSpots: [], ...(weaknesses === undefined ? {} : { weaknesses }) } } };
  const stage = env.document.createElement('div');
  stage.setAttribute('id', 'stage');
  env.document.body.appendChild(stage);
  ['quiz', 'quests'].forEach((id) => w.OwnIt.register({ id, name: id, keys: [], play() {} }));
  w.OwnIt.router.go('home');
  const open = (game) => Array.from(stage.querySelectorAll('.tile-game')).find((t) => t.getAttribute('data-game') === game).click();
  return { env, w, open, opts: () => env.document.body.querySelectorAll('.level-opt') };
}

test('picker: Secret is hidden without weaknesses and for games not in the set', () => {
  let h = bootHome(undefined);
  h.open('quests');
  assert.equal(h.opts().length, 5);
  assert.equal(h.env.document.body.querySelectorAll('.secret-opt').length, 0);
  h = bootHome(2);
  h.open('quiz');
  assert.equal(h.env.document.body.querySelectorAll('.secret-opt').length, 0);
});

test('picker: Secret shows as ?????? and flips to SECRET on hover when the zone has a weakness', () => {
  const h = bootHome(1);
  h.open('quests');
  assert.equal(h.opts().length, 6);
  const s = h.env.document.body.querySelector('.secret-opt');
  assert.equal(s.querySelector('.flap').getAttribute('aria-label'), '??????');
  fire(s, 'pointerenter');
  assert.equal(s.querySelector('.flap').getAttribute('aria-label'), 'SECRET');
});

// ---------------------------------------------------------------- the quests break round

const SCREENS = {
  s1: { zone: 'trips', html: '<main></main>', inputs: {} },
  s2: { zone: 'trips', html: '<main></main>', inputs: {} },
};
const WHY = 'The approve endpoint skips the role check.';
function secretRound(kind, steps, over = {}) {
  return {
    id: 'trips-quests-1', game: 'quests', zone: 'trips', mode: 'practice', level: 'secret', flow: 'f1', goal: 'Claude found a way to break this. Find it.', start: 's1',
    objectives: [{ text: 'Open', element: 'el-open' }, { text: 'Confirm', element: 'el-confirm' }, { text: 'Approve', element: 'el-approve' }],
    answer: coreJs.encode([
      { element: 'el-open', on: 's1', does: 'f1', goes: 's2' }, { element: 'el-confirm', on: 's2', does: 'f1' }, { element: 'el-approve', on: 's2', does: 'f1' },
    ]),
    secret: { kind, answer: coreJs.encode({ steps, text: 'A driver can approve.', why: WHY, ref: 'api/t.ts:2' }) },
    nav: {
      'el-open': { on: 's1', goes: 's2', roles: ['driver'] }, 'el-amount': { on: 's1' }, 'el-submit': { on: 's1' }, 'el-help': { on: 's1' },
      'el-confirm': { on: 's2', roles: ['driver'] }, 'el-approve': { on: 's2', roles: ['manager'] },
    },
    labels: { driver: { label: 'Driver' }, manager: { label: 'Manager' } },
    ...over,
  };
}
const TAGS = { s1: ['el-open', 'el-amount', 'el-submit', 'el-help'], s2: ['el-confirm', 'el-approve'] };

function bootQuest(round) {
  const env = createEnv({ reduced: true });
  env.load(...FILES);
  const w = env.window;
  w.TextDecoder = TextDecoder;
  w.OWNIT_SCREENS = SCREENS;
  vm.runInContext(readFileSync(new URL('core.js', ASSETS), 'utf8'), env.ctx, { filename: 'core.js' });
  w.OwnIt.audio = { play() {} };
  w.OwnIt.juice.shake = () => {};
  w.OwnIt.juice.confetti = () => {};
  const results = [];
  w.OwnIt.resultCard = (c, r) => { results.push(r); return { sent: true }; };
  let clock = 1000;
  w.OwnIt.secret.now = () => clock;
  const frames = [];
  const realCreate = env.document.createElement;
  env.document.createElement = (tag) => {
    const el = realCreate(tag);
    if (String(tag).toLowerCase() === 'iframe') { const inner = createEnv().document; el.contentDocument = inner; el.inner = inner; frames.push(el); }
    return el;
  };
  vm.runInContext(readFileSync(new URL('games/quests.js', ASSETS), 'utf8'), env.ctx, { filename: 'quests.js' });
  const root = env.document.createElement('div');
  env.document.body.appendChild(root);
  const finished = [];
  const c = { game: 'quests', roundId: round.id, root, router: { go() {} }, toast() {}, keys: { on: (k, f) => w.OwnIt.keys.on(k, f, 'quests') }, finish: (p) => finished.push(p) };
  w.OwnIt.keys.setScope('quests');
  live.push(w.OwnIt.games.get('quests').play(root, round, c));
  const press = (text) => {
    const b = Array.from(env.document.body.querySelectorAll('button')).find((x) => x.textContent.trim() === text);
    assert.ok(b, `button ${text}`);
    b.dispatchEvent(env.event('click'));
  };
  const load = (sid) => {
    const f = frames[frames.length - 1];
    for (const id of TAGS[sid]) { const d = f.inner.createElement('button'); d.setAttribute('data-ownit', id); f.inner.body.appendChild(d); }
    f.dispatchEvent(env.event('load', { bubbles: false }));
  };
  const click = (id) => {
    const f = frames[frames.length - 1];
    const el = f.inner.body.querySelector(`[data-ownit="${id}"]`);
    assert.ok(el, `tagged ${id}`);
    el.dispatchEvent(env.event('click'));
  };
  const start = () => { press('Start'); load('s1'); };
  return { env, root, finished, results, frames, press, load, click, start, advance: (ms) => { clock += ms; }, text: () => root.textContent, wrongCount: () => root.querySelector('.quest-tally').textContent };
}

test('break round: hides the steps and shows only a category chip, with the weakness kept obfuscated', () => {
  const r = secretRound('role', [{ element: 'el-approve', role: 'driver' }]);
  assert.equal(typeof r.secret.answer, 'string');
  const t = bootQuest(r);
  t.start();
  assert.match(t.text(), /Hint: Role/);
  assert.ok(!t.text().includes('Confirm'), 'objectives stay hidden');
  assert.ok(!t.text().includes('api/t.ts:2'));
  assert.ok(!t.text().includes(WHY));
  assert.equal(t.finished.length, 0);
});

test('role weakness: approving as the wrong role breaks it; the valid role does not', () => {
  const steps = [{ element: 'el-approve', role: 'driver' }];
  const ok = bootQuest(secretRound('role', steps));
  ok.start();
  ok.click('el-open'); ok.load('s2');
  ok.press('Switch role'); ok.press('Manager');
  ok.click('el-confirm'); // manager is not allowed here: a wrong turn, not a break
  ok.click('el-approve');
  assert.equal(ok.finished.length, 0, 'a normal flow does not falsely trigger');

  const t = bootQuest(secretRound('role', steps));
  t.start();
  t.click('el-open'); t.load('s2');
  t.click('el-confirm');
  t.click('el-approve'); // still signed in as driver
  assert.equal(t.finished.length, 1);
  assert.equal(t.finished[0].found, true);
  assert.equal(t.finished[0].kind, 'role');
  assert.equal(t.finished[0].got, 1);
  const report = t.root.querySelector('.secret-report');
  assert.ok(report);
  assert.match(report.textContent, /api\/t\.ts:2/);
  assert.match(report.textContent, /skips the role check/);
  assert.match(report.textContent, /own-it never edits your code/);
  assert.equal(t.root.querySelector('.secret-banner .flap').getAttribute('aria-label'), 'BROKEN');
});

test('double weakness: two taps within 400 ms break it, a slow second tap does not', () => {
  const steps = [{ element: 'el-help' }];
  const slow = bootQuest(secretRound('double', steps));
  slow.start();
  slow.click('el-help'); slow.advance(500); slow.click('el-help');
  assert.equal(slow.finished.length, 0);
  assert.match(slow.wrongCount(), /2 wrong turns/);
  const t = bootQuest(secretRound('double', steps));
  t.start();
  t.click('el-help'); t.advance(300); t.click('el-help');
  assert.equal(t.finished.length, 1);
  assert.equal(t.finished[0].kind, 'double');
});

test('order weakness: skipping a step breaks it; the normal order does not', () => {
  const steps = [{ element: 'el-approve' }];
  const normal = bootQuest(secretRound('order', steps, { nav: { ...secretRound().nav, 'el-confirm': { on: 's2' }, 'el-approve': { on: 's2' } } }));
  normal.start();
  normal.click('el-open'); normal.load('s2');
  normal.click('el-confirm'); normal.click('el-approve');
  assert.equal(normal.finished.length, 0);
  const t = bootQuest(secretRound('order', steps, { nav: { ...secretRound().nav, 'el-confirm': { on: 's2' }, 'el-approve': { on: 's2' } } }));
  t.start();
  t.click('el-open'); t.load('s2');
  t.click('el-approve'); // skipped Confirm
  assert.equal(t.finished.length, 1);
  assert.equal(t.finished[0].kind, 'order');
});

test('input weakness: the odd value then submit breaks it; submit alone does not', () => {
  const steps = [{ element: 'el-amount' }, { element: 'el-submit' }];
  const a = bootQuest(secretRound('input', steps));
  a.start();
  a.click('el-submit');
  assert.equal(a.finished.length, 0);
  const t = bootQuest(secretRound('input', steps));
  t.start();
  t.click('el-amount'); t.click('el-submit');
  assert.equal(t.finished.length, 1);
  assert.equal(t.finished[0].kind, 'input');
});

test('Reveal gives up: not found, the case report appears, no XP', () => {
  const t = bootQuest(secretRound('role', [{ element: 'el-approve', role: 'driver' }]));
  t.start();
  t.click('el-help');
  t.press('Reveal');
  assert.equal(t.finished.length, 1);
  assert.equal(t.finished[0].found, false);
  assert.equal(t.finished[0].got, 0);
  assert.equal(t.finished[0].wrong.length, 1);
  assert.match(t.root.querySelector('.secret-report').textContent, /api\/t\.ts:2/);
  t.press('See result');
  assert.equal(t.results[0].xp, 0);
});

test('a find scores 40 plus a time bonus, minus wrong turns', () => {
  const { S } = bootModule();
  assert.equal(S.xp(0, 0), 60);
  assert.equal(S.xp(180, 0), 40);
  assert.equal(S.xp(90, 2), 40 + 10 - 10);
});
