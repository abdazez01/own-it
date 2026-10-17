import { test, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createEnv } from './fake-dom.mjs';

const require = createRequire(import.meta.url);
const core = require('../own-it/assets/core.js');
const ASSETS = new URL('../own-it/assets/', import.meta.url);
const FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js', 'gamekit.js'];

const live = [];
after(() => live.forEach((f) => { try { f(); } catch { /* already cleaned */ } }));

function boot(game, round) {
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
  w.OwnIt.juice.confetti = () => {};
  const results = [];
  const alerts = [];
  w.OwnIt.field = { setAlert: (on) => alerts.push(on) };
  vm.runInContext(readFileSync(new URL(`games/${game}.js`, ASSETS), 'utf8'), env.ctx, { filename: `${game}.js` });
  w.OwnIt.resultCard = (c, r) => { results.push(r); if (r.payload) c.finish(r.payload); return { sent: true }; };
  const root = env.document.createElement('div');
  env.document.body.appendChild(root);
  const finished = [];
  const ctx = {
    game, roundId: `trips-${game}-1`, root, router: { go() {} }, toast() {},
    keys: { on: (k, f) => w.OwnIt.keys.on(k, f, game) },
    finish: (p) => finished.push(p),
  };
  w.OwnIt.keys.setScope(game);
  const cleanup = w.OwnIt.games.get(game).play(root, round, ctx);
  live.push(cleanup);
  const key = (k) => env.document.dispatchEvent(env.event('keydown', { key: k }));
  return { env, w, root, key, alerts, sounds, finished, results, cleanup, decodes: () => decodes, shakes: () => shakes };
}

const plain = (x) => JSON.parse(JSON.stringify(x));
const tuples = (t, name) => t.sounds.filter((s) => Array.isArray(s) && s[0] === name);

// ------------------------------------------------------------------ memory match

const N = 4;
const meaningOf = (i) => (i - 1 + N) % N; // term i pairs with this meaning index
const mmRound = () => ({
  zone: 'trips', mode: 'practice',
  terms: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
  meanings: ['means delta', 'means alpha', 'means bravo', 'means charlie'],
  answer: core.encode([0, 1, 2, 3].map(meaningOf)),
  labels: {},
});
const mmCards = (t) => Array.from(t.root.querySelectorAll('.mm-card'));
// The DOM carries no ids. With Math.random fixed at 0 the game's shuffle is known: replay it to find a card by what it is.
function layout(n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push(['term', i], ['meaning', i]);
  for (let i = a.length - 1; i > 0; i--) { const j = 0, x = a[i]; a[i] = a[j]; a[j] = x; }
  return a;
}
const cardOf = (t, kind, idx) => mmCards(t)[layout(N).findIndex((c) => c[0] === kind && c[1] === idx)];
const flip = (t, kind, idx) => cardOf(t, kind, idx).click();

test('memory-match: registers, shows 2n face-down cards, decodes only when a term meets a meaning', () => {
  const t = boot('memory-match', mmRound());
  assert.equal(t.w.OwnIt.games.get('memory-match').id, 'memory-match');
  assert.equal(mmCards(t).length, 8);
  assert.ok(!/Alpha/.test(t.root.textContent), 'faces are hidden');
  assert.ok(mmCards(t).every((c) => !c.hasAttribute('data-kind') && !c.hasAttribute('data-idx')), 'no pairing hints in the DOM');
  flip(t, 'term', 0);
  assert.equal(t.decodes(), 0);
  assert.match(t.root.textContent, /Alpha/);
  flip(t, 'meaning', meaningOf(0));
  assert.equal(t.decodes(), 1);
});

test('memory-match: +10 per pair, -2 per mismatch after the third', () => {
  const t = boot('memory-match', mmRound());
  for (let i = 0; i < 5; i++) { flip(t, 'term', 0); flip(t, 'meaning', (meaningOf(0) + 1) % N); }
  assert.equal(t.sounds.filter((s) => s === 'wrong').length, 5);
  assert.equal(t.shakes(), 5);
  for (let i = 0; i < N; i++) { flip(t, 'term', i); flip(t, 'meaning', meaningOf(i)); }
  assert.equal(t.finished.length, 1);
  assert.equal(t.finished[0].got, N);
  assert.equal(t.finished[0].of, N);
  assert.equal(t.finished[0].game, 'memory-match');
  assert.equal(t.results[0].xp, N * 10 - 2 * 2);
  assert.deepEqual(plain(t.finished[0].missed), ['0']);
  assert.ok(tuples(t, 'combo').length >= 1, 'combo sound on a streak');
});

test('memory-match: the first three mismatches are free, a clean game scores 40', () => {
  const t = boot('memory-match', mmRound());
  for (let i = 0; i < 3; i++) { flip(t, 'term', 1); flip(t, 'term', 2); }
  for (let i = 0; i < N; i++) { flip(t, 'term', i); flip(t, 'meaning', meaningOf(i)); }
  assert.equal(t.results[0].xp, N * 10);
  const clean = boot('memory-match', mmRound());
  for (let i = 0; i < N; i++) { flip(clean, 'term', i); flip(clean, 'meaning', meaningOf(i)); }
  assert.equal(clean.results[0].xp, 40);
  assert.deepEqual(plain(clean.finished[0].missed), []);
});

test('memory-match: keyboard moves between cards with arrows and flips with Enter', () => {
  const t = boot('memory-match', mmRound());
  const up = () => mmCards(t).filter((c) => c.classList.contains('up')).length;
  t.key('Enter');
  assert.equal(up(), 1);
  t.key('ArrowRight');
  assert.equal(t.env.document.activeElement, mmCards(t)[1]);
  t.key('ArrowDown');
  assert.equal(t.env.document.activeElement, mmCards(t)[5]);
  t.key('ArrowLeft'); t.key('ArrowUp');
  assert.equal(t.env.document.activeElement, mmCards(t)[0]);
  t.key('ArrowRight');
  t.key('Enter');
  assert.ok(mmCards(t)[1].classList.contains('up'));
  assert.ok(up() >= 1 && up() <= 2);
  t.key('Enter'); // a card that is already up does nothing
  assert.ok(mmCards(t)[1].classList.contains('up'));
});

test('memory-match: cleanup stops the pending flip-back and the keys', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const t = boot('memory-match', mmRound());
    flip(t, 'term', 0); flip(t, 'term', 1);
    t.cleanup();
    t.key('Enter');
    mock.timers.tick(5000);
    assert.equal(t.finished.length, 0);
  } finally { mock.timers.reset(); }
});

// ------------------------------------------------------------------ spot the lie

const lieRound = (over = {}) => ({
  zone: 'trips', mode: 'practice', answer: core.encode(2), labels: {},
  statements: Array.from({ length: 5 }, (_, i) => ({ text: `Statement ${i} text`, why: core.encode(`Why ${i} holds`) })), ...over,
});
const stmts = (t) => Array.from(t.root.querySelectorAll('.answer'));

test('spot-the-lie: five statements, answer decoded only on a pick', () => {
  const t = boot('spot-the-lie', lieRound());
  assert.equal(stmts(t).length, 5);
  assert.equal(t.decodes(), 0);
  assert.ok(!/Why 0 holds/.test(t.root.textContent), 'reasons wait until after');
  stmts(t)[0].click();
  assert.equal(t.decodes(), 2, 'the answer and the reason shown');
  assert.match(t.root.textContent, /Why 0 holds/);
});

test('spot-the-lie: 10 XP on the first try', () => {
  const t = boot('spot-the-lie', lieRound());
  stmts(t)[2].click();
  assert.ok(t.sounds.includes('correct'));
  assert.match(t.root.textContent, /Why 2 holds/);
  t.key('Enter');
  assert.equal(t.results[0].xp, 10);
  assert.equal(t.finished[0].got, 1);
  assert.equal(t.finished[0].of, 1);
  assert.deepEqual(plain(t.finished[0].missed), []);
});

test('spot-the-lie: a wrong pick shows its reason and costs the XP, the lie must still be found', () => {
  const t = boot('spot-the-lie', lieRound());
  stmts(t)[0].click();
  assert.ok(t.sounds.includes('wrong'));
  assert.equal(t.shakes(), 1);
  assert.match(t.root.textContent, /Why 0 holds/);
  assert.equal(t.finished.length, 0);
  stmts(t)[0].click(); // the same one again does nothing
  assert.equal(t.sounds.filter((s) => s === 'wrong').length, 1);
  stmts(t)[2].click();
  t.key('Enter');
  assert.equal(t.results[0].xp, 0);
  assert.equal(t.finished[0].got, 0);
  assert.deepEqual(plain(t.finished[0].missed), ['0']);
});

test('spot-the-lie: keys 1-5 pick, Enter finishes', () => {
  const t = boot('spot-the-lie', lieRound());
  t.key('2');
  assert.ok(stmts(t)[1].classList.contains('wrong'));
  t.key('3');
  assert.ok(stmts(t)[2].classList.contains('right'));
  t.key('5'); // after the lie is found, picks are ignored
  assert.ok(!stmts(t)[4].classList.contains('picked'));
  t.key('Enter');
  assert.equal(t.finished.length, 1);
});

// ------------------------------------------------------------------ chain reaction

const crRound = () => ({
  zone: 'trips', mode: 'practice', flow: 'f2', answer: core.encode(['a', 'b', 'c']), labels: { f2: { label: 'Pay out', kind: 'flow' } },
  cards: [{ id: 'c', label: 'Third' }, { id: 'a', label: 'First' }, { id: 'b', label: 'Second' }],
});
const crCards = (t) => Array.from(t.root.querySelectorAll('.cr-card'));
const crLabel = { a: 'First', b: 'Second', c: 'Third' };
const crClick = (t, id) => crCards(t).find((c) => c.textContent.endsWith(crLabel[id])).click();

test('chain-reaction: in-order clicks score 10 each with a rising combo', () => {
  const t = boot('chain-reaction', crRound());
  assert.equal(crCards(t).length, 3);
  assert.match(t.root.textContent, /Pay out/);
  crClick(t, 'a'); crClick(t, 'b'); crClick(t, 'c');
  const ns = tuples(t, 'combo').map((s) => s[1]);
  assert.equal(ns.length, 3);
  assert.ok(ns[0] < ns[1] && ns[1] < ns[2], 'pitch rises');
  assert.equal(t.finished.length, 1);
  assert.equal(t.results[0].xp, 30);
  assert.equal(t.finished[0].got, 3);
  assert.equal(t.finished[0].of, 3);
  assert.deepEqual(plain(t.finished[0].missed), []);
});

test('chain-reaction: a wrong click explodes (shake, wrong), the step is retried, only the streak is lost', () => {
  const t = boot('chain-reaction', crRound());
  assert.ok(crCards(t).every((c) => !c.hasAttribute('data-id')), 'no model ids in the DOM');
  crClick(t, 'a');
  assert.equal(t.decodes(), 1, 'decoded on the click, not before');
  crClick(t, 'a'); // already lit: ignored
  assert.equal(t.shakes(), 0);
  crClick(t, 'c'); // wrong: step 2 is b
  assert.equal(t.shakes(), 1);
  assert.ok(t.sounds.includes('wrong'));
  assert.equal(t.finished.length, 0);
  crClick(t, 'b'); crClick(t, 'c');
  assert.equal(t.finished.length, 1);
  assert.equal(t.results[0].xp, 30);
  assert.deepEqual(plain(t.finished[0].wrong), [['c', 'b']]);
  assert.deepEqual(plain(t.finished[0].missed), [], 'a step lit after a retry is done');
  assert.match(t.results[0].missed.map((m) => m.text).join(' '), /Lit after a retry.*Second/);
});

test('chain-reaction: the fuse burns 30 s with ticks in the last 5, then the unlit steps are missed', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const t = boot('chain-reaction', crRound());
    crClick(t, 'a');
    mock.timers.tick(24000);
    assert.equal(tuples(t, 'tick').length, 0);
    mock.timers.tick(5000);
    assert.deepEqual(tuples(t, 'tick').map((s) => s[1]), [5, 4, 3, 2, 1], 'one tick per second, with the seconds left');
    assert.equal(t.finished.length, 0);
    mock.timers.tick(1000);
    assert.equal(t.finished.length, 1);
    assert.equal(t.finished[0].got, 1);
    assert.equal(t.results[0].xp, 10);
    assert.deepEqual(plain(t.finished[0].missed), ['b', 'c']);
    assert.equal(t.root.querySelector('.cr-fuse').getAttribute('aria-valuenow'), '0');
  } finally { mock.timers.reset(); }
});

test('chain-reaction: keys 1-9 light the nth card, Enter lights the focused one, arrows move', () => {
  const t = boot('chain-reaction', crRound());
  t.key('2'); // cards are shown as c, a, b: "2" is First
  assert.ok(crCards(t)[1].classList.contains('lit'));
  t.key('ArrowLeft');
  assert.equal(t.env.document.activeElement, crCards(t)[0]);
  t.key('ArrowRight');
  assert.equal(t.env.document.activeElement, crCards(t)[1]);
  t.key('ArrowRight');
  assert.equal(t.env.document.activeElement, crCards(t)[2]);
  t.key('Enter'); // Second
  assert.ok(crCards(t)[2].classList.contains('lit'));
  t.key('9'); // no such card
  t.key('1'); // Third
  assert.equal(t.finished.length, 1);
});

test('chain-reaction: cleanup stops the fuse', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const t = boot('chain-reaction', crRound());
    t.cleanup();
    mock.timers.tick(40000);
    assert.equal(t.finished.length, 0);
  } finally { mock.timers.reset(); }
});

// ------------------------------------------------------------------ who is allowed

const waRound = () => ({
  zone: 'trips', mode: 'practice', labels: {},
  cards: Array.from({ length: 8 }, (_, i) => ({ action: `Do thing ${i}`, role: `role${i}`, answer: core.encode(i % 2 === 0 ? 'allow' : 'deny'), why: core.encode(`Because ${i} is the rule`) })),
});
const waBtn = (t, cls) => t.root.querySelector(`.wa-btn.${cls}`);
const waCard = (t) => t.root.querySelector('.wa-action').textContent;

test('whos-allowed: streak points 10 x (1 + streak/5), rising combo, miss breaks the streak, why after each card', () => {
  const t = boot('whos-allowed', waRound());
  assert.equal(t.decodes(), 0);
  assert.equal(waCard(t), 'Do thing 0');
  assert.ok(!/Because 0/.test(t.root.textContent));
  waBtn(t, 'allow').click(); waBtn(t, 'deny').click(); waBtn(t, 'allow').click(); // 10 + 12 + 14
  assert.equal(t.decodes(), 6, 'a verdict and a reason per card');
  assert.deepEqual(tuples(t, 'combo').map((s) => s[1]), [1, 2, 3]);
  assert.match(t.root.textContent, /Because 2 is the rule/);
  waBtn(t, 'allow').click(); // card 3 is deny: miss
  assert.ok(t.sounds.includes('streak-break'));
  assert.ok(t.sounds.includes('wrong'));
  assert.equal(t.shakes(), 1);
  assert.match(t.root.textContent, /Because 3 is the rule/);
  assert.equal(t.finished.length, 0);
  waBtn(t, 'allow').click(); waBtn(t, 'deny').click(); waBtn(t, 'allow').click(); waBtn(t, 'deny').click(); // 10 + 12 + 14 + 16
  assert.equal(t.finished.length, 1);
  assert.equal(t.results[0].xp, 36 + 52);
  assert.equal(t.finished[0].got, 7);
  assert.equal(t.finished[0].of, 8);
  assert.equal(t.finished[0].game, 'whos-allowed');
  assert.deepEqual(plain(t.finished[0].missed), ['3']);
  assert.match(t.results[0].missed[0].text, /may not.*Do thing 3.*Because 3/);
});

test('whos-allowed: 60 s clock ticks in the last 5, then cards left unjudged count as missed', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const t = boot('whos-allowed', waRound());
    waBtn(t, 'allow').click();
    mock.timers.tick(54000);
    assert.equal(tuples(t, 'tick').length, 0);
    mock.timers.tick(5000);
    assert.deepEqual(tuples(t, 'tick').map((s) => s[1]), [5, 4, 3, 2, 1]);
    assert.equal(t.finished.length, 0);
    mock.timers.tick(1000);
    assert.equal(t.finished.length, 1);
    assert.equal(t.finished[0].got, 1);
    assert.equal(t.results[0].xp, 10);
    assert.deepEqual(plain(t.finished[0].missed), ['1', '2', '3', '4', '5', '6', '7']);
  } finally { mock.timers.reset(); }
});

test('whos-allowed: left arrow denies, right arrow allows; swipes do the same', () => {
  const t = boot('whos-allowed', waRound());
  t.key('ArrowRight'); t.key('ArrowLeft');
  assert.equal(waCard(t), 'Do thing 2');
  assert.deepEqual(tuples(t, 'combo').map((s) => s[1]), [1, 2]);
  const card = t.root.querySelector('.wa-card');
  const touch = (type, x) => card.dispatchEvent(t.env.event(type, type === 'touchstart' ? { touches: [{ clientX: x }] } : { changedTouches: [{ clientX: x }] }));
  touch('touchstart', 200); touch('touchend', 120); // swipe left: deny, but card 2 is allow
  assert.equal(waCard(t), 'Do thing 3');
  assert.ok(t.sounds.includes('wrong'));
  touch('touchstart', 100); touch('touchend', 120); // too short: nothing
  assert.equal(waCard(t), 'Do thing 3');
  touch('touchstart', 100); touch('touchend', 190); // swipe right: allow, card 3 is deny
  assert.equal(waCard(t), 'Do thing 4');
});

test('whos-allowed: cleanup stops the clock and the keys', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const t = boot('whos-allowed', waRound());
    t.cleanup();
    t.key('ArrowRight');
    mock.timers.tick(70000);
    assert.equal(t.finished.length, 0);
  } finally { mock.timers.reset(); }
});

// ------------------------------------------------------------------ blast radius

const brRound = () => ({
  zone: 'trips', mode: 'practice', target: 't', answer: core.encode(['b', 'c']),
  labels: { t: { label: 'Core service', kind: 'component' } },
  cards: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Bravo' }, { id: 'c', label: 'Charlie' }, { id: 'd', label: 'Delta' }],
});
const brParts = (t) => Array.from(t.root.querySelectorAll('.br-part'));
const brDone = (t) => Array.from(t.root.querySelectorAll('button')).find((b) => b.textContent === 'Done');

test('blast-radius: score is 10 x the balance of precision and recall, decoded only on Done', () => {
  const t = boot('blast-radius', brRound());
  assert.match(t.root.textContent, /Core service breaks/);
  assert.ok(brParts(t).every((b) => !b.hasAttribute('data-id')), 'no ids in the DOM');
  brParts(t)[1].click(); brParts(t)[3].click(); // Bravo (right), Delta (false alarm)
  assert.equal(t.decodes(), 0);
  brDone(t).click();
  assert.equal(t.decodes(), 1);
  assert.match(t.root.textContent, /You found 1 of 2 parts that break, with 1 false alarm./);
  assert.equal(t.finished.length, 1);
  assert.equal(t.results[0].xp, 5); // precision 1/2, recall 1/2
  assert.equal(t.finished[0].precision, 0.5);
  assert.equal(t.finished[0].recall, 0.5);
  assert.match(t.finished[0].formula, /2PR/);
  assert.equal(t.finished[0].got, 1);
  assert.equal(t.finished[0].of, 2);
  assert.deepEqual(plain(t.finished[0].missed), ['c']);
  assert.deepEqual(plain(t.finished[0].falseAlarms), ['d']);
  assert.ok(brParts(t)[2].classList.contains('missed'));
  assert.ok(brParts(t)[1].classList.contains('hit'));
  assert.ok(brParts(t)[3].classList.contains('false-alarm'));
});

test('blast-radius: tapping again unmarks; a perfect pick scores 10, nothing picked scores 0', () => {
  const t = boot('blast-radius', brRound());
  brParts(t)[0].click(); brParts(t)[0].click();
  brParts(t)[1].click(); brParts(t)[2].click();
  brDone(t).click();
  assert.equal(t.results[0].xp, 10);
  assert.deepEqual(plain(t.finished[0].missed), []);
  const none = boot('blast-radius', brRound());
  brDone(none).click();
  assert.equal(none.results[0].xp, 0);
  assert.deepEqual(plain(none.finished[0].missed), ['b', 'c']);
});

test('blast-radius: arrows move, Space or Enter marks the focused part, D finishes', () => {
  const t = boot('blast-radius', brRound());
  t.key('ArrowRight');
  assert.equal(t.env.document.activeElement, brParts(t)[1]);
  t.key(' ');
  assert.ok(brParts(t)[1].classList.contains('on'));
  t.key('ArrowDown'); t.key('Enter');
  assert.ok(brParts(t)[2].classList.contains('on'));
  t.key('ArrowLeft'); t.key('ArrowLeft'); t.key('ArrowLeft');
  assert.equal(t.env.document.activeElement, brParts(t)[0]);
  t.key('d');
  assert.equal(t.finished.length, 1);
  assert.equal(t.results[0].xp, 10);
  t.key(' '); // after Done nothing changes
  assert.ok(!brParts(t)[0].classList.contains('on'));
});

// ------------------------------------------------------------------ pager

const pgRound = () => ({
  zone: 'trips', mode: 'practice', failure: 'Riders see an empty trip list.', answer: core.encode('x3'),
  logs: ['app opened trips screen', 'request sent to server', 'server asked the store', 'store answered slowly', 'server gave up waiting'],
  cards: ['x1', 'x2', 'x3', 'x4'].map((id, i) => ({ id, label: `Step ${i + 1} label` })),
  labels: {},
});
const pgBtns = (t) => Array.from(t.root.querySelectorAll('.answer'));
const pgLines = (t) => t.root.querySelectorAll('.pg-line').length;

test('pager: alarm and salmon alert at the start, logs appear one by one, alert clears at the end', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const t = boot('pager', pgRound());
    assert.ok(t.sounds.includes('alarm'));
    assert.deepEqual(plain(t.alerts), [true]);
    assert.match(t.root.textContent, /Riders see an empty trip list/);
    assert.equal(pgLines(t), 1);
    mock.timers.tick(1500);
    assert.equal(pgLines(t), 2);
    mock.timers.tick(10000);
    assert.equal(pgLines(t), 5);
    assert.equal(t.decodes(), 0);
    pgBtns(t)[2].click();
    assert.equal(t.decodes(), 1);
    assert.deepEqual(plain(t.alerts), [true, false]);
    assert.equal(t.finished.length, 1);
  } finally { mock.timers.reset(); }
});

test('pager: finding the step fast scores 20 + up to 10 for speed, a wrong pick costs 10', () => {
  const quick = boot('pager', pgRound());
  pgBtns(quick)[2].click();
  assert.ok(quick.sounds.includes('correct'));
  assert.equal(quick.results[0].xp, 30);
  assert.equal(quick.finished[0].got, 1);
  assert.deepEqual(plain(quick.finished[0].missed), []);
  const slip = boot('pager', pgRound());
  pgBtns(slip)[0].click();
  assert.ok(slip.sounds.includes('wrong'));
  assert.equal(slip.shakes(), 1);
  assert.equal(slip.finished.length, 0);
  pgBtns(slip)[0].click(); // the same wrong card again does nothing
  assert.equal(slip.shakes(), 1);
  pgBtns(slip)[2].click();
  assert.equal(slip.results[0].xp, 20);
  assert.deepEqual(plain(slip.finished[0].missed), []);
  assert.deepEqual(plain(slip.finished[0].wrong), ['x1']);
  assert.ok(Array.from(slip.root.querySelectorAll('*')).every((n) => !n.hasAttribute('data-id')), 'no ids in the DOM');
});

test('pager: 90 s clock with ticks in the last 5, then time is up and the culprit is shown', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const t = boot('pager', pgRound());
    mock.timers.tick(84000);
    assert.equal(tuples(t, 'tick').length, 0);
    mock.timers.tick(5000);
    assert.deepEqual(tuples(t, 'tick').map((s) => s[1]), [5, 4, 3, 2, 1]);
    assert.equal(t.finished.length, 0);
    mock.timers.tick(1000);
    assert.equal(t.finished.length, 1);
    assert.equal(t.finished[0].got, 0);
    assert.equal(t.results[0].xp, 0);
    assert.deepEqual(plain(t.finished[0].missed), ['0']);
    assert.match(t.results[0].missed[0].text, /Step 3 label/);
    assert.deepEqual(plain(t.alerts), [true, false]);
  } finally { mock.timers.reset(); }
});

test('pager: keys 1-4 pick a card; cleanup clears the alert and stops the clock', () => {
  const t = boot('pager', pgRound());
  t.key('1');
  assert.ok(pgBtns(t)[0].classList.contains('wrong'));
  t.key('3');
  assert.equal(t.finished.length, 1);
  t.key('2'); // after the end picks are ignored
  assert.ok(!pgBtns(t)[1].classList.contains('wrong'));
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const u = boot('pager', pgRound());
    u.cleanup();
    assert.deepEqual(plain(u.alerts), [true, false]);
    mock.timers.tick(100000);
    assert.equal(u.finished.length, 0);
  } finally { mock.timers.reset(); }
});

// ------------------------------------------------------------------ kit.clock

test('kit.clock: drains a bar, ticks the last 5 s, reports elapsed time and ends once; stop prevents the end', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  try {
    const t = boot('pager', pgRound());
    t.cleanup();
    t.sounds.length = 0;
    const host = t.env.document.createElement('div');
    const elapsed = [];
    let ended = 0;
    const c = t.w.OwnIt.kit.clock(host, 8000, { label: 'Left', onTick: (e) => elapsed.push(e), onEnd: () => { ended++; } });
    assert.equal(host.querySelector('.cr-fuse').getAttribute('aria-label'), 'Left');
    assert.equal(c.remaining(), 8000);
    mock.timers.tick(2900);
    assert.equal(tuples(t, 'tick').length, 0);
    mock.timers.tick(200);
    assert.deepEqual(tuples(t, 'tick').map((s) => s[1]), [5], 'first tick when 5 s are left');
    assert.equal(c.remaining(), 4900);
    assert.equal(elapsed[0], 100);
    mock.timers.tick(10000);
    assert.equal(ended, 1);
    assert.equal(host.querySelector('.cr-fuse').getAttribute('aria-valuenow'), '0');
    assert.equal(c.remaining(), 0);
    const stopped = t.w.OwnIt.kit.clock(host, 3000, { onEnd: () => { ended++; } });
    stopped.stop(); stopped.stop();
    mock.timers.tick(5000);
    assert.equal(ended, 1);
  } finally { mock.timers.reset(); }
});
