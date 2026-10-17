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
  return { env, w, root, key, sounds, finished, results, cleanup, decodes: () => decodes, shakes: () => shakes };
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
  statements: Array.from({ length: 5 }, (_, i) => ({ text: `Statement ${i} text`, why: `Why ${i} holds` })), ...over,
});
const stmts = (t) => Array.from(t.root.querySelectorAll('.answer'));

test('spot-the-lie: five statements, answer decoded only on a pick', () => {
  const t = boot('spot-the-lie', lieRound());
  assert.equal(stmts(t).length, 5);
  assert.equal(t.decodes(), 0);
  assert.ok(!/Why 0 holds/.test(t.root.textContent), 'reasons wait until after');
  stmts(t)[0].click();
  assert.equal(t.decodes(), 1);
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
