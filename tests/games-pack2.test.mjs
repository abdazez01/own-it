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
const all = (t, sel) => Array.from(t.root.querySelectorAll(sel));
const focused = (t) => t.env.document.activeElement;

// ------------------------------------------------------------------ data detective

const ddRound = () => ({
  zone: 'trips', mode: 'practice', entity: 'A trip',
  answer: core.encode({ order: ['a', 'b', 'c'], by: ['rider', 'driver'] }),
  cards: [{ id: 'c', label: 'Done' }, { id: 'a', label: 'Requested' }, { id: 'b', label: 'Active' }],
  who: [{ id: 'system', label: 'Dispatch' }, { id: 'driver', label: 'Driver' }, { id: 'rider', label: 'Rider' }],
  labels: {},
});
const ddCards = (t) => all(t, '.dd-card');
const ddWho = (t) => all(t, '.dd-who');
const ddCard = (t, text) => ddCards(t).find((c) => c.textContent.endsWith(text));
const ddPick = (t, text) => ddWho(t).find((c) => c.textContent === text).click();

test('data-detective: stamp each status in order and name who moved it, 10 per right call', () => {
  const t = boot('data-detective', ddRound());
  assert.equal(ddCards(t).length, 3);
  assert.match(t.root.textContent, /A trip/);
  assert.ok([...ddCards(t), ...ddWho(t)].every((c) => !c.hasAttribute('data-id')), 'no model ids in the DOM');
  assert.equal(t.decodes(), 0, 'nothing decoded before the first stamp');
  ddCard(t, 'Requested').click();
  assert.equal(t.decodes(), 1);
  ddCard(t, 'Active').click();
  assert.equal(t.root.querySelector('.dd-whos').hasAttribute('hidden'), false, 'asks who after the second stamp');
  ddCard(t, 'Done').click(); // locked while a who is pending
  assert.equal(ddCard(t, 'Done').classList.contains('used'), false);
  ddPick(t, 'Rider');
  ddCard(t, 'Done').click();
  ddPick(t, 'Dispatch'); // wrong: the driver moved it
  assert.equal(t.shakes(), 1);
  assert.equal(t.finished.length, 1);
  assert.equal(t.finished[0].got, 4);
  assert.equal(t.finished[0].of, 5);
  assert.equal(t.results[0].xp, 40);
  assert.deepEqual(plain(t.finished[0].missed), ['c']);
  assert.match(t.results[0].missed.map((m) => m.text).join(' '), /Active to Done.*Driver/);
  assert.ok(tuples(t, 'combo').length >= 3);
});

test('data-detective: a wrong stamp shakes and is retried, only the streak is lost', () => {
  const t = boot('data-detective', ddRound());
  ddCard(t, 'Done').click(); // first is Requested
  assert.equal(t.shakes(), 1);
  assert.equal(t.finished.length, 0);
  ddCard(t, 'Requested').click(); ddCard(t, 'Active').click(); ddPick(t, 'Rider');
  ddCard(t, 'Done').click(); ddPick(t, 'Driver');
  assert.equal(t.finished[0].got, 5);
  assert.equal(t.results[0].xp, 50);
  assert.deepEqual(plain(t.finished[0].wrong), [['c', 'a']]);
  assert.deepEqual(plain(t.finished[0].missed), ['a'], 'a retried stamp is listed for review');
});

test('data-detective: keys 1-9 stamp or pick, arrows move, Enter activates', () => {
  const t = boot('data-detective', ddRound());
  t.key('2'); // cards are Done, Requested, Active
  assert.ok(ddCards(t)[1].classList.contains('used'));
  t.key('3');
  assert.equal(focused(t), ddWho(t)[0], 'focus moves to the who choices');
  t.key('ArrowRight');
  assert.equal(focused(t), ddWho(t)[1]);
  t.key('ArrowLeft'); t.key('ArrowLeft');
  assert.equal(focused(t), ddWho(t)[0], 'does not wrap');
  t.key('3'); // Rider
  assert.equal(tuples(t, 'combo').length, 3);
  assert.equal(t.root.querySelector('.dd-whos').hasAttribute('hidden'), true);
  t.key('9'); // no such card
  t.key('1'); // Done
  t.key('ArrowDown');
  t.key('Enter'); // the focused who choice
  assert.equal(t.finished.length, 1);
});

// ------------------------------------------------------------------ what-if dial

const wiDial = (n, right) => ({
  label: `Dial ${n}: traffic grows tenfold`, options: [`A${n}`, `B${n}`, `C${n}`, `D${n}`],
  answer: core.encode(right), why: core.encode(`Because of rule ${n}.`),
});
const wiRound = () => ({ zone: 'trips', mode: 'practice', dials: [wiDial(1, 2), wiDial(2, 0), wiDial(3, 3)], labels: {} });
const wiOpts = (t) => all(t, '.wi-opt');
const wiLock = (t) => t.root.querySelector('.wi-lock');
const wiNext = (t) => t.root.querySelector('.wi-next');

test('what-if: turn the dial to a prediction, lock it in, 10 per right call, the reason shows after', () => {
  const t = boot('what-if', wiRound());
  assert.equal(wiOpts(t).length, 4);
  assert.match(t.root.textContent, /Dial 1/);
  assert.ok(wiOpts(t).every((o) => !o.hasAttribute('data-i') && !o.hasAttribute('data-answer')), 'nothing about the answer in the DOM');
  assert.equal(t.decodes(), 0, 'nothing decoded before a lock');
  wiOpts(t)[2].click(); // select C1
  assert.equal(t.decodes(), 0);
  wiLock(t).click();
  assert.equal(t.decodes(), 2, 'answer and reason decoded on the lock');
  assert.match(t.root.textContent, /Because of rule 1/);
  assert.equal(wiOpts(t).filter((o) => o.classList.contains('fell')).length, 4, 'the cascade reaches every option');
  wiLock(t).click(); // a second lock does nothing
  assert.equal(t.decodes(), 2);
  wiNext(t).click();
  wiOpts(t)[3].click(); wiLock(t).click(); // wrong: the answer is A2
  assert.equal(t.shakes(), 1);
  assert.ok(wiOpts(t)[0].classList.contains('first'), 'the thing that fails first is marked');
  wiNext(t).click();
  wiOpts(t)[3].click(); wiLock(t).click();
  assert.equal(t.finished.length, 0, 'the result waits for the last reveal to be read');
  wiNext(t).click();
  assert.equal(t.finished.length, 1);
  assert.equal(t.finished[0].got, 2);
  assert.equal(t.finished[0].of, 3);
  assert.equal(t.results[0].xp, 20);
  assert.deepEqual(plain(t.finished[0].missed), ['1']);
  assert.match(t.results[0].missed.map((m) => m.text).join(' '), /Dial 2.*A2.*Because of rule 2/);
});

test('what-if: arrows turn the dial and wrap, a number picks, Enter locks then moves on', () => {
  const t = boot('what-if', wiRound());
  const on = () => wiOpts(t).findIndex((o) => o.getAttribute('aria-checked') === 'true');
  assert.equal(on(), 0);
  t.key('ArrowLeft');
  assert.equal(on(), 3, 'wraps');
  t.key('ArrowRight'); t.key('ArrowRight'); t.key('ArrowRight');
  assert.equal(on(), 2);
  t.key('Enter'); // lock C1: right
  assert.equal(tuples(t, 'combo').length, 1);
  t.key('ArrowRight'); // the dial is locked while the reason shows
  assert.equal(on(), 2);
  t.key('Enter'); // next
  assert.match(t.root.textContent, /Dial 2/);
  t.key('1'); t.key('Enter'); t.key('Enter'); // A2, locked, next
  t.key('4'); t.key('Enter'); t.key('Enter'); // D3, locked, result
  assert.equal(t.finished.length, 1);
  assert.equal(t.results[0].xp, 30);
});

// ------------------------------------------------------------------ pipe plumber

// A 3 x 2 grid, cells 0 1 2 / 3 4 5. The path runs 0, 1, 2, 5. Rotations are clockwise quarter turns from the shapes
// cap (open up), straight (up and down), corner (up and right).
const ppRound = () => ({
  zone: 'trips', mode: 'practice', flow: 'f1', grid: { cols: 3, rows: 2 }, start: 0, end: 5, pathLength: 4,
  tiles: [
    { type: 'cap', rot: 0, id: 'a' }, { type: 'straight', rot: 0, id: 'b' }, { type: 'corner', rot: 0, id: 'c' },
    { type: 'straight', rot: 1 }, { type: 'corner', rot: 3, id: 'x' }, { type: 'cap', rot: 1, id: 'd' },
  ],
  answer: core.encode({ path: ['a', 'b', 'c', 'd'] }),
  labels: { a: { label: 'Pay button' }, b: { label: 'Trip service' }, c: { label: 'Queue' }, d: { label: 'Database' }, x: { label: 'Cache' }, f1: { label: 'Pay out' } },
});
const ppTiles = (t) => all(t, '.pp-tile');
const ppTurn = (t, i, times = 1) => { for (let k = 0; k < times; k++) ppTiles(t)[i].click(); };

test('pipe-plumber: tiles turn on a tap, the water reaches the end, +10 per tile on the path', () => {
  const t = boot('pipe-plumber', ppRound());
  assert.equal(ppTiles(t).length, 6);
  assert.match(t.root.textContent, /Pay button/);
  assert.match(t.root.textContent, /Database/);
  assert.ok(ppTiles(t).every((c) => !c.hasAttribute('data-id') && !c.hasAttribute('data-path')), 'no path hints in the DOM');
  assert.equal(t.decodes(), 0, 'nothing decoded before the water flows');
  ppTurn(t, 0);
  assert.equal(ppTiles(t)[0].getAttribute('data-turn'), '1');
  ppTurn(t, 1); ppTurn(t, 2, 2);
  assert.equal(t.finished.length, 0);
  assert.match(t.root.querySelector('.pp-live').textContent, /3 of 4/, 'live count of the tiles the water has reached');
  ppTurn(t, 5, 3);
  assert.equal(t.decodes(), 1);
  assert.equal(t.finished.length, 1);
  assert.equal(t.finished[0].got, 4);
  assert.equal(t.finished[0].of, 4);
  assert.equal(t.results[0].xp, 40);
  assert.ok(ppTiles(t).filter((c) => c.classList.contains('wet')).length === 4, 'the water runs through the four path tiles');
  assert.match(t.results[0].missed.map((m) => m.text).join(' ') + t.root.textContent, /Pay button.*Trip service.*Queue.*Database/);
  assert.ok(tuples(t, 'correct').length + t.sounds.filter((s) => s === 'correct').length >= 1);
});

test('pipe-plumber: arrows move over the grid, R and Enter turn the focused tile', () => {
  const t = boot('pipe-plumber', ppRound());
  assert.equal(focused(t), ppTiles(t)[0], 'starts on the first tile of the path');
  t.key('r');
  assert.equal(ppTiles(t)[0].getAttribute('data-turn'), '1');
  t.key('ArrowRight');
  assert.equal(focused(t), ppTiles(t)[1]);
  t.key('Enter');
  t.key('ArrowRight');
  t.key('R'); t.key('r');
  t.key('ArrowLeft'); t.key('ArrowLeft'); t.key('ArrowLeft');
  assert.equal(focused(t), ppTiles(t)[0], 'stops at the edge');
  t.key('ArrowDown');
  assert.equal(focused(t), ppTiles(t)[3]);
  t.key('ArrowDown');
  assert.equal(focused(t), ppTiles(t)[3], 'stops at the bottom');
  t.key('ArrowRight'); t.key('ArrowRight');
  assert.equal(focused(t), ppTiles(t)[5]);
  t.key('r'); t.key(' '); t.key('r');
  assert.equal(t.finished.length, 1);
  assert.equal(t.results[0].xp, 40);
});
