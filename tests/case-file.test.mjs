import { test, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createEnv } from './fake-dom.mjs';
import { run as init } from '../own-it/scripts/lib/cmd-init.mjs';
import { run as build } from '../own-it/scripts/lib/cmd-build-round.mjs';
import { loadModel, saveModel } from '../own-it/scripts/lib/model.mjs';
import { readJson } from '../own-it/scripts/lib/json.mjs';
import { listGames, getGame, GAMES_DIR } from '../own-it/scripts/lib/games.mjs';
import { check, loadSchema } from '../own-it/scripts/lib/validate.mjs';
import coreMjs from '../own-it/scripts/lib/core.mjs';
import { tmpProject, ctx as cliCtx } from './helpers.mjs';

const require = createRequire(import.meta.url);
const core = require('../own-it/assets/core.js');
const ASSETS = new URL('../own-it/assets/', import.meta.url);
const FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js', 'gamekit.js'];
const plain = (x) => JSON.parse(JSON.stringify(x));

// ------------------------------------------------------------------ meta and schema

test('case-file: meta, schema file and game.html tag exist', () => {
  const m = getGame('case-file');
  assert.equal(m.rung, 'break');
  assert.equal(m.name, 'Case File');
  assert.match(m.logo, /#E8C26A/);
  assert.ok(readdirSync(GAMES_DIR).includes('case-file.schema.json'));
  assert.ok(listGames().some((g) => g.id === 'case-file'));
  assert.match(readFileSync(new URL('game.html', ASSETS), 'utf8'), /games\/case-file\.js/);
  assert.ok(!/innerHTML/.test(readFileSync(new URL('games/case-file.js', ASSETS), 'utf8')));
});

// ------------------------------------------------------------------ build-round

const I = (o) => ({ conf: 'high', ref: 'api/t.ts:1', ...o });
const CULPRIT_REF = 'api/culprit.ts:42';
async function setup() {
  const root = tmpProject({ 'api/t.ts': 'x\n' });
  writeFileSync(join(root, 'zones.json'), JSON.stringify({ zones: [{ id: 'trips', name: 'Trips', paths: ['api'] }] }));
  await init({ _: [], flags: { zones: join(root, 'zones.json') } }, cliCtx(root));
  const m = loadModel(root);
  m.zones.trips.items = [
    I({ id: 'c1', k: 'component', label: 'Barracks queue', ref: CULPRIT_REF }),
    ...[2, 3, 4, 5, 6, 7].map((n) => I({ id: `c${n}`, k: 'component', label: `Part number ${n}`, ref: `api/p${n}.ts:${n}` })),
    I({ id: 'bare', k: 'component' }),
    I({ id: 'noref', k: 'component', label: 'No ref part', ref: 'x:1' }),
    I({ id: 's1', k: 'surface', label: 'Build menu' }),
  ];
  delete m.zones.trips.items.find((x) => x.id === 'noref').ref;
  saveModel(root, m);
  return root;
}
const ev = (rel) => rel.map((r, i) => ({ text: `Evidence card number ${i}`, relevant: r, why: `Reason number ${i} explained.` }));
const REL = [true, false, true, false, true, false];
const kase = (over = {}) => ({ zone: 'trips', mode: 'practice', case: { report: 'Players report units freeze after building a barracks.', evidence: ev(REL),
  suspects: ['c1', 'c2', 'c3'], answer: 'c1', why: 'The queue never clears, so units wait forever.', ...over } });
const put = (root, obj) => { const p = join(root, 'in.json'); writeFileSync(p, JSON.stringify(obj)); return p; };
const bld = (root, obj, flags = {}) => build({ _: ['case-file', put(root, obj)], flags }, cliCtx(root));
const loadRound = (root, id) => {
  const sb = { window: {} };
  vm.runInNewContext(readFileSync(join(root, '.own-it', 'data', `${id}.js`), 'utf8'), sb);
  return JSON.parse(JSON.stringify(sb.window.OWNIT_ROUNDS[id]));
};
const dec = (s) => coreMjs.decode(s);

test('case-file schema: shape errors name the field', async () => {
  const s = loadSchema(join(GAMES_DIR, 'case-file.schema.json'));
  assert.deepEqual(check(kase(), s), []);
  assert.ok(check({ zone: 'trips', case: { ...kase().case, evidence: ev(REL).slice(0, 5) } }, s).some((e) => /case\.evidence: at least 6/.test(e)));
  assert.ok(check({ zone: 'trips', case: { ...kase().case, suspects: ['c1'] } }, s).some((e) => /case\.suspects: at least 2/.test(e)));
  assert.ok(check({ zone: 'trips', case: { ...kase().case, suspects: ['a', 'b', 'c', 'd', 'e', 'f'] } }, s).some((e) => /at most 5/.test(e)));
  assert.ok(check({ zone: 'trips' }, s).some((e) => /case: required/.test(e)));
});

test('case-file build: order, relevance, culprit, why and ref are only in the obfuscated data', async () => {
  const root = await setup();
  const out = await bld(root, kase());
  assert.equal(out.id, 'trips-case-file-1');
  const raw = readFileSync(join(root, '.own-it', 'data', `${out.id}.js`), 'utf8');
  for (const secret of [CULPRIT_REF, 'The queue never clears', 'Reason number 0 explained', 'culprit.ts', '"relevant"', '"answer":"c1"', '"answer":true', '"answer":false', '"answer": true', '"answer": false', '"answer": "c1"']) {
    assert.ok(!raw.includes(secret), `plaintext "${secret}" leaked`);
  }
  const r = loadRound(root, out.id);
  assert.equal(r.game, 'case-file');
  assert.equal(r.rung, 'break');
  assert.equal(r.case, undefined);
  assert.equal(r.report, 'Players report units freeze after building a barracks.');
  assert.equal(dec(r.answer), 'c1');
  assert.equal(dec(r.why), 'The queue never clears, so units wait forever.');
  assert.equal(dec(r.where), CULPRIT_REF);
  assert.equal(r.evidence.length, 6);
  assert.equal(r.evidence.filter((e) => dec(e.answer) === true).length, 3);
  assert.ok(r.evidence.every((e) => typeof e.answer === 'string' && typeof e.why === 'string' && e.relevant === undefined));
  assert.match(dec(r.evidence.find((e) => /number 0$/.test(e.text)).why), /Reason number 0/);
  assert.equal(dec(r.evidence.find((e) => /number 0$/.test(e.text)).answer), true);
  assert.ok(r.suspects.every((s) => typeof s.label === 'string' && s.ref === undefined && s.label !== s.id));
  assert.ok(r.suspects.some((s) => s.id === 'c1'));
  assert.equal(r.suspects.length, 4, 'medium pads to 4 suspects from the zone');
  assert.ok(!JSON.stringify(r.labels).includes('culprit.ts'));
  const session = readJson(join(root, '.own-it', 'session.json'));
  assert.equal(session.rounds[out.id].rung, 'break');
  assert.equal(session.rounds[out.id].game, 'case-file');
});

test('case-file build: evidence and suspects order is shuffled, not the written order', async () => {
  const root = await setup();
  const orders = new Set();
  for (let i = 0; i < 12; i++) {
    const r = loadRound(root, (await bld(root, kase())).id);
    orders.add(r.evidence.map((e) => e.text).join('|'));
  }
  assert.ok(orders.size > 1, 'the evidence order varies');
});

test('case-file build: levels scale clues and suspects', async () => {
  const root = await setup();
  const many = kase({ suspects: ['c1', 'c2', 'c3', 'c4', 'c5'] });
  const shape = async (flags, obj = many) => {
    const r = loadRound(root, (await bld(root, obj, flags)).id);
    assert.equal(r.evidence.filter((e) => dec(e.answer) === true).length, 3, 'all 3 real clues stay');
    assert.ok(r.suspects.some((s) => s.id === 'c1'), 'the culprit stays a suspect');
    assert.equal(new Set(r.suspects.map((s) => s.id)).size, r.suspects.length);
    return { cards: r.evidence.length, suspects: r.suspects.length, level: r.level, labelled: Object.keys(r.labels).sort().join() === r.suspects.map((s) => s.id).sort().join() };
  };
  assert.deepEqual(await shape({ level: 'easy' }), { cards: 4, suspects: 2, level: 'easy', labelled: true });
  assert.deepEqual(await shape({ level: 'medium' }), { cards: 6, suspects: 4, level: 'medium', labelled: true });
  assert.deepEqual(await shape({ level: 'hard' }, kase()), { cards: 6, suspects: 5, level: 'hard', labelled: true });
  assert.deepEqual(await shape({ level: 'impossible' }), { cards: 6, suspects: 5, level: 'impossible', labelled: true });
  assert.deepEqual((await shape({ level: 'custom', base: 'easy', about: 'I know React' })).cards, 4);
  assert.deepEqual(await shape({}), { cards: 6, suspects: 4, level: undefined, labelled: true });
});

test('case-file build: bad cases are rejected before anything is written', async () => {
  const root = await setup();
  const bad = async (over, re, caseOver = true) => {
    await assert.rejects(bld(root, caseOver ? kase(over) : over), re);
  };
  await bad({ evidence: ev([true, true, true, true, false, false]) }, /exactly 3 relevant evidence cards, found 4/);
  await bad({ evidence: ev([true, true, false, false, false, false]) }, /exactly 3 relevant evidence cards, found 2/);
  await bad({ answer: 'c4' }, /answer is not one of the suspects/);
  await bad({ suspects: ['c1', 'c1', 'c2'] }, /duplicate suspects/);
  await bad({ suspects: ['c1', 'ghost'] }, /ids not in zone "trips": ghost/);
  await bad({ suspects: ['c1', 'bare'] }, /suspect "bare" has no label/);
  await bad({ answer: 'noref', suspects: ['noref', 'c2'] }, /"noref" has no ref/);
  await bad({ report: 'cancel_trip_handler' }, /identifier-only answer in case\.report/);
  await bad({ evidence: ev(REL).map((e, i) => (i === 3 ? { ...e, text: '`src/api/queue.ts`' } : e)) }, /identifier-only answer in case\.evidence\[3\]\.text/);
  await bad({ zone: 'nope', case: kase().case }, /unknown zone "nope"/, false);
  await bad({ zone: 'trips' }, /case: required/, false);
  assert.equal(readJson(join(root, '.own-it', 'progress.json')).seq, 0);
  assert.ok(!existsSync(join(root, '.own-it', 'session.json')) && !existsSync(join(root, '.own-it', 'data')), 'nothing was written');
});

// ------------------------------------------------------------------ the game

const live = [];
const REAL_RANDOM = Math.random;
after(() => { live.forEach((f) => { try { f(); } catch { /* already cleaned */ } }); Math.random = REAL_RANDOM; });

function boot(round, { link, level } = {}) {
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
  let shakes = 0, confetti = 0;
  w.OwnIt.juice.shake = () => { shakes++; };
  w.OwnIt.juice.confetti = () => { confetti++; };
  const results = [];
  vm.runInContext(readFileSync(new URL('games/case-file.js', ASSETS), 'utf8'), env.ctx, { filename: 'case-file.js' });
  w.OwnIt.resultCard = (c, r) => { results.push(r); if (r.payload) c.finish(r.payload); return { sent: true }; };
  const roundId = 'trips-case-file-1';
  if (level) w.OWNIT_ROUNDS = { [roundId]: { level } };
  const root = env.document.createElement('div');
  env.document.body.appendChild(root);
  const finished = [];
  const ctx = { game: 'case-file', roundId, root, router: { go() {} }, toast() {}, keys: { on: (k, f) => w.OwnIt.keys.on(k, f, 'case-file') }, finish: (p) => finished.push(p), link };
  w.OwnIt.keys.setScope('case-file');
  const cleanup = w.OwnIt.games.get('case-file').play(root, round, ctx);
  live.push(cleanup);
  const key = (k) => env.document.dispatchEvent(env.event('keydown', { key: k }));
  const q = (sel) => Array.from(root.querySelectorAll(sel));
  return { env, w, root, key, q, sounds, finished, results, cleanup, decodes: () => decodes, shakes: () => shakes, confetti: () => confetti };
}

const RELEVANT = [false, true, false, true, true, false];            // clue 2, 4 and 5 (keys) are real
const gRound = (over = {}) => ({
  zone: 'trips', mode: 'practice', report: 'Players report units freeze after building a barracks.',
  evidence: RELEVANT.map((r, i) => ({ text: `Clue text ${i + 1}`, answer: core.encode(r), why: core.encode(`Why clue ${i + 1} ${r ? 'matters' : 'does not'}.`) })),
  suspects: [{ id: 'c1', label: 'Alpha service' }, { id: 'c2', label: 'Barracks queue' }, { id: 'c3', label: 'Gamma store' }, { id: 'c4', label: 'Delta cache' }],
  answer: core.encode('c2'), why: core.encode('The queue never clears.'), where: core.encode('api/queue.ts:42'), labels: {}, ...over,
});
const link = (mode) => {
  const sent = [], subs = [];
  return { mode, sent, subs, send(type, payload) { sent.push({ type, payload }); return Promise.resolve(true); },
    onData(cb) { subs.push(cb); return () => { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); }; }, onMode() { return () => {}; } };
};
const say = (t, text) => { const box = t.root.querySelector('.cf-text'); box.value = text; box.dispatchEvent(t.env.event('keydown', { key: 'Enter' })); };

test('case-file play: shows the report, 6 clue cards and decodes nothing until the player acts', () => {
  const t = boot(gRound());
  assert.match(t.root.textContent, /units freeze after building a barracks/);
  assert.equal(t.q('.cf-clue').length, 6);
  assert.equal(t.q('.cf-accuse')[0].hasAttribute('hidden'), true);
  t.key('1'); t.key('2'); t.key('3');
  assert.equal(t.q('.cf-clue').filter((c) => c.classList.contains('on')).length, 3);
  assert.equal(t.decodes(), 0, 'toggling decodes nothing');
  assert.ok(!/api\/queue/.test(t.root.textContent) && !/never clears/.test(t.root.textContent));
  assert.ok(t.q('.cf-clue').every((c) => !c.hasAttribute('data-id') && !c.hasAttribute('data-relevant')));
});

test('case-file play: the 4th pick is refused, a pick can be put back, Enter needs exactly three', () => {
  const t = boot(gRound());
  t.key('Enter');
  assert.equal(t.q('.cf-accuse')[0].hasAttribute('hidden'), true, 'no lock with nothing chosen');
  assert.equal(t.decodes(), 0);
  t.key('1'); t.key('2'); t.key('3'); t.key('4');
  assert.equal(t.q('.cf-clue').filter((c) => c.classList.contains('on')).length, 3);
  assert.match(t.q('.cf-live')[0].textContent, /limit/);
  t.key('1');
  assert.equal(t.q('.cf-clue')[0].classList.contains('on'), false);
  assert.match(t.root.textContent, /2 of 3 chosen/);
  t.key('Enter');
  assert.equal(t.decodes(), 0);
  t.key('4');
  t.key('Enter');
  assert.ok(t.decodes() >= 6, 'the lock decodes relevance');
  assert.equal(t.q('.cf-accuse')[0].hasAttribute('hidden'), false);
});

test('case-file play: a perfect case in file mode scores 4 of 4 and 25 XP, keys A-D accuse, confetti on success', () => {
  const t = boot(gRound());
  t.key('2'); t.key('4'); t.key('5');
  t.key('Enter');
  const cl = t.q('.cf-clue');
  assert.ok([1, 3, 4].every((i) => cl[i].classList.contains('right')));
  assert.equal(t.sounds.filter((s) => Array.isArray(s) && s[0] === 'combo').length, 3);
  assert.equal(t.decodes(), 6);
  t.key('b');
  assert.ok(t.q('.cf-suspect')[1].classList.contains('right'));
  assert.equal(t.q('.cf-motive')[0].hasAttribute('hidden'), false);
  assert.equal(t.finished.length, 0, 'the motive comes before the verdict');
  say(t, 'The queue never frees a slot.');
  assert.equal(t.q('.cf-closed')[0].hasAttribute('hidden'), false);
  const text = t.root.textContent;
  assert.match(text, /Case closed/);
  assert.match(text, /Barracks queue is the guilty part/);
  assert.match(text, /api\/queue\.ts:42/);
  assert.match(text, /The queue never clears\./);
  assert.match(text, /Why clue 2 matters/);
  assert.match(text, /Why clue 1 does not/);
  assert.equal(t.q('.cf-link').length, 4, '3 real clues and the culprit');
  assert.equal(t.confetti(), 1);
  assert.ok(t.sounds.includes('levelup'));
  t.key('Enter');
  assert.equal(t.finished.length, 1);
  const f = t.finished[0];
  assert.equal(f.game, 'case-file');
  assert.equal(f.got, 4);
  assert.equal(f.of, 4);
  assert.deepEqual(plain(f.missed), []);
  assert.deepEqual(plain(f.text), { q1: 'The queue never frees a slot.' });
  assert.equal(f.graded, false);
  assert.equal(t.results[0].xp, 25);
  assert.equal(t.results[0].missed.length, 0);
});

test('case-file play: a red herring and a wrong suspect cost points and the result names the real culprit', () => {
  const t = boot(gRound());
  t.key('1'); t.key('2'); t.key('4');   // clue 1 is a herring, clue 5 is missed
  t.key('Enter');
  const cl = t.q('.cf-clue');
  assert.ok(cl[0].classList.contains('herring'));
  assert.ok(cl[4].classList.contains('missed'));
  assert.equal(t.shakes(), 1);
  t.key('a');
  assert.ok(t.q('.cf-suspect')[0].classList.contains('wrong'));
  assert.ok(t.sounds.includes('wrong'));
  t.q('.cf-skip')[0].click();
  assert.match(t.root.textContent, /Wrong suspect/);
  assert.match(t.root.textContent, /You named Alpha service\. The guilty part is Barracks queue/);
  assert.match(t.root.textContent, /Motive skipped/);
  assert.equal(t.confetti(), 0);
  t.key('Enter');
  const f = t.finished[0];
  assert.equal(f.got, 2);
  assert.deepEqual(plain(f.missed), ['c2']);
  assert.deepEqual(plain(f.wrong), [['c1', 'c2']]);
  assert.deepEqual(plain(f.text), {});
  assert.equal(t.results[0].xp, 10, 'two real clues, no accusation, no motive');
  const review = t.results[0].missed.map((m) => m.text).join('\n');
  assert.match(review, /Red herring: Clue text 1/);
  assert.match(review, /missed this clue: Clue text 5/);
  assert.match(review, /Barracks queue \(api\/queue\.ts:42\)/);
});

test('case-file play: live mode sends the motive as an ask and shows the grade (solid = 20 XP)', () => {
  const l = link('live');
  const t = boot(gRound(), { link: l });
  t.key('2'); t.key('4'); t.key('5'); t.key('Enter'); t.key('b');
  const box = t.root.querySelector('.cf-text');
  box.value = 'Because the queue never clears.';
  box.dispatchEvent(t.env.event('keydown', { key: 'Enter', shiftKey: true }));
  assert.equal(l.sent.length, 0, 'Shift+Enter is a new line');
  say(t, '   ');
  assert.equal(l.sent.length, 0, 'empty text is not sent');
  say(t, 'Because the queue never clears.');
  assert.deepEqual(plain(l.sent[0]), { type: 'ask', payload: { round: 'trips-case-file-1', q: 'q1', text: 'Because the queue never clears.' } });
  assert.equal(t.finished.length, 0);
  assert.equal(t.q('.cf-closed')[0].hasAttribute('hidden'), true, 'waits for Claude');
  t.w.OWNIT_FEEDBACK = { 'trips-case-file-1': { grades: { q1: 'partial' }, notes: { q1: 'Say what the queue holds.' } } };
  l.subs.slice().forEach((f) => f({ file: 'data/feedback-trips-case-file-1.js' }));
  assert.match(t.root.textContent, /Motive: Shaky\./);
  assert.match(t.root.textContent, /Say what the queue holds/);
  t.key('Enter');
  assert.equal(t.finished[0].grades.q1, 'partial');
  assert.equal(t.results[0].xp, 15 + 10 + 10);
});

test('case-file play: solid and blind motives', () => {
  for (const [g, xp, lead] of [['solid', 45, /Solid\./], ['miss', 25, /Blind\./]]) {
    const l = link('live');
    const t = boot(gRound(), { link: l });
    t.key('2'); t.key('4'); t.key('5'); t.key('Enter'); t.key('b');
    say(t, 'My reason.');
    t.w.OWNIT_FEEDBACK = { 'trips-case-file-1': { grades: { q1: g } } };
    l.subs.slice().forEach((f) => f({ file: 'data/feedback-trips-case-file-1.js' }));
    assert.match(t.root.textContent, lead);
    t.key('Enter');
    assert.equal(t.results[0].xp, xp);
  }
});

test('case-file play: impossible has a clock and no hint; a timeout closes the case', () => {
  const t = boot(gRound(), { level: 'medium' });
  assert.equal(t.q('.cr-fuse').length, 0, 'no clock below impossible');
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const u = boot(gRound(), { level: 'impossible' });
    assert.equal(u.q('.cr-fuse').length, 1);
    const hint = u.q('button').find((b) => b.textContent === 'Hint');
    assert.ok(hint.hasAttribute('disabled'), 'hints are off at impossible');
    u.key('2'); u.key('4');
    mock.timers.tick(90000);
    assert.equal(u.q('.cf-closed')[0].hasAttribute('hidden'), false, 'time up closes the case');
    assert.match(u.root.textContent, /Wrong suspect/);
    assert.match(u.root.textContent, /api\/queue\.ts:42/);
    u.key('Enter');
    assert.equal(u.finished[0].got, 2);
    assert.deepEqual(plain(u.finished[0].missed), ['c2']);
    // a finished round does not keep ticking
    mock.timers.tick(90000);
    assert.equal(u.finished.length, 1);
  } finally { mock.timers.reset(); }
});

test('case-file play: the hint button marks one real clue that is not yet chosen', () => {
  const t = boot(gRound(), { level: 'easy' });
  const btn = t.q('button').find((b) => b.textContent === 'Hint');
  assert.ok(!btn.hasAttribute('hidden'), 'hint is available');
  btn.click();
  Array.from(t.env.document.body.querySelectorAll('button')).find((b) => b.textContent === 'Show hint').click();
  const hinted = t.q('.cf-clue').filter((c) => c.classList.contains('hinted'));
  assert.equal(hinted.length, 1);
  assert.ok([1, 3, 4].includes(t.q('.cf-clue').indexOf(hinted[0])));
  t.key('Escape');
});

test('case-file play: fewer cards and suspects (easy shape) still play; 5 suspects take key E; cleanup frees the keys', () => {
  const easy = gRound({ evidence: gRound().evidence.filter((e, i) => RELEVANT[i]).concat(gRound().evidence.slice(0, 1)), suspects: [{ id: 'c2', label: 'Barracks queue' }, { id: 'c1', label: 'Alpha service' }] });
  const t = boot(easy);
  assert.equal(t.q('.cf-clue').length, 4);
  t.key('1'); t.key('2'); t.key('3');
  t.key('Enter');
  assert.equal(t.q('.cf-suspect').length, 2);
  t.key('c');   // no third suspect
  assert.equal(t.q('.cf-motive')[0].hasAttribute('hidden'), true);
  t.key('a');
  assert.ok(t.q('.cf-suspect')[0].classList.contains('right'));
  const five = gRound({ suspects: [...gRound().suspects, { id: 'c5', label: 'Epsilon log' }] });
  const u = boot(five);
  assert.equal(u.q('.cf-suspect').length, 5);
  u.cleanup();
  u.key('1');
  assert.equal(u.q('.cf-clue').filter((c) => c.classList.contains('on')).length, 0, 'keys are released');
});

test('case-file play: refuses a malformed round', () => {
  assert.throws(() => boot({ zone: 'trips' }), /malformed|cannot be played/i);
  assert.throws(() => boot(gRound({ evidence: gRound().evidence.slice(0, 3) })), /malformed|cannot be played/i);
  assert.throws(() => boot(gRound({ suspects: [{ id: 'c1', label: 'Alpha' }] })), /malformed|cannot be played/i);
  assert.throws(() => boot(gRound({ where: undefined })), /malformed|cannot be played/i);
});
