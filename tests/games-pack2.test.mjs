import { test, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createEnv } from './fake-dom.mjs';

const require = createRequire(import.meta.url);
const core = require('../own-it/assets/core.js');
const ASSETS = new URL('../own-it/assets/', import.meta.url);
const FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js', 'gamekit.js', 'screenhost.js'];

const REAL_RANDOM = Math.random;
const live = [];
after(() => { live.forEach((f) => { try { f(); } catch { /* already cleaned */ } }); Math.random = REAL_RANDOM; });

function boot(game, round, { link } = {}) {
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
    finish: (p) => finished.push(p), link,
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
    { type: 'cap', rot: 0 }, { type: 'straight', rot: 0 }, { type: 'corner', rot: 0 },
    { type: 'straight', rot: 1 }, { type: 'corner', rot: 3 }, { type: 'cap', rot: 1 },
  ],
  answer: core.encode({ cells: [0, 1, 2, 5], names: ['Pay button', 'Trip service', 'Queue', 'Database'] }),
  labels: { f1: { label: 'Pay out' } },
});
const ppTiles = (t) => all(t, '.pp-tile');
const ppTurn = (t, i, times = 1) => { for (let k = 0; k < times; k++) ppTiles(t)[i].click(); };

test('pipe-plumber: tiles turn on a tap, the water reaches the end, +10 per tile on the path', () => {
  const t = boot('pipe-plumber', ppRound());
  assert.equal(ppTiles(t).length, 6);
  assert.ok(!/Pay button|Database|Queue/.test(t.root.textContent), 'step names stay hidden until the water flows');
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
  assert.match(t.root.querySelector('.pp-live').textContent, /Pay button.*Trip service.*Queue.*Database/);
  assert.equal(t.sounds.filter((s) => s === 'correct').length, 1);
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

test('pipe-plumber: a round that arrives already connected is scrambled, never solved at the start', () => {
  const r = ppRound();
  r.tiles = [{ type: 'cap', rot: 1 }, { type: 'straight', rot: 1 }, { type: 'corner', rot: 2 }, { type: 'straight', rot: 1 }, { type: 'corner', rot: 3 }, { type: 'cap', rot: 0 }];
  const t = boot('pipe-plumber', r);
  assert.equal(t.finished.length, 0);
  assert.equal(ppTiles(t)[5].classList.contains('reached'), false, 'the water does not reach the end at the start');
});

test('data-detective: arrows move over the status grid in two dimensions', () => {
  const t = boot('data-detective', ddRound());
  assert.equal(focused(t), ddCards(t)[0]);
  t.key('ArrowDown');
  assert.equal(focused(t), ddCards(t)[2], 'two columns, so down from the first is the third');
  t.key('ArrowRight');
  assert.equal(focused(t), ddCards(t)[2], 'no card to the right of the last');
  t.key('ArrowUp');
  assert.equal(focused(t), ddCards(t)[0]);
  t.key('ArrowRight');
  assert.equal(focused(t), ddCards(t)[1]);
  t.key('ArrowRight');
  assert.equal(focused(t), ddCards(t)[1], 'stops at the edge');
});

test('games refuse a malformed round instead of quietly dropping parts of it', () => {
  const dd = ddRound(); dd.cards[1] = { label: 'No id' };
  assert.throws(() => boot('data-detective', dd), /malformed|cannot be played/i);
  const wi = wiRound(); wi.dials[1].options = ['Only one', 3];
  assert.throws(() => boot('what-if', wi), /malformed|cannot be played/i);
  const pp = ppRound(); pp.tiles[2] = { type: 'bend', rot: 0 };
  assert.throws(() => boot('pipe-plumber', pp), /malformed|cannot be played/i);
  assert.throws(() => boot('pipe-plumber', Object.assign(ppRound(), { tiles: [] })), /malformed|cannot be played/i);
});

// ------------------------------------------------------------------ design duel

const dlDecision = (n, side, reason) => ({
  a: `Design A${n}`, b: `Design B${n}`, reasons: [`Reason ${n}a`, `Reason ${n}b`, `Reason ${n}c`, `Reason ${n}d`],
  answer: core.encode({ side, reason }),
});
const dlRound = () => ({ zone: 'trips', mode: 'practice', decisions: [dlDecision(1, 0, 2), dlDecision(2, 1, 0), dlDecision(3, 0, 3)], labels: {} });
const dlSides = (t) => all(t, '.dl-side');
const dlReasons = (t) => all(t, '.dl-reason');
const dlNext = (t) => t.root.querySelector('.dl-next');

test('design-duel: pick your design (5), then the real reason (5), answer decoded only on a pick', () => {
  const t = boot('design-duel', dlRound());
  assert.equal(dlSides(t).length, 2);
  assert.ok([...dlSides(t), ...dlReasons(t)].every((b) => !b.hasAttribute('data-real') && !b.hasAttribute('data-side') && !b.hasAttribute('data-answer')), 'nothing about the answer in the DOM');
  assert.equal(dlReasons(t).length, 0, 'reasons wait for the design pick');
  assert.equal(t.decodes(), 0);
  dlSides(t)[0].click();
  assert.equal(t.decodes(), 1);
  assert.equal(dlReasons(t).length, 4);
  dlReasons(t)[2].click();
  assert.match(t.root.textContent, /Reason 1c/);
  assert.equal(tuples(t, 'combo').length, 1);
  dlNext(t).click();
  dlSides(t)[0].click(); // wrong design (the real one is B2), right reason
  dlReasons(t)[0].click();
  assert.equal(t.shakes(), 1, 'the wrong design shakes');
  dlNext(t).click();
  dlSides(t)[0].click(); dlReasons(t)[1].click(); // right design, wrong reason
  assert.equal(t.finished.length, 0, 'the result waits for the last reveal to be read');
  dlNext(t).click();
  assert.equal(t.finished.length, 1);
  assert.equal(t.finished[0].got, 1);
  assert.equal(t.finished[0].of, 3);
  assert.equal(t.results[0].xp, 20);
  assert.deepEqual(plain(t.finished[0].missed), ['1', '2']);
  assert.match(t.results[0].missed.map((m) => m.text).join(' '), /Design B2.*Reason 2a/);
  assert.deepEqual(plain(t.finished[0].text), {});
});

test('design-duel: A and B pick a design, 1-4 or A-D a reason, Enter moves on', () => {
  const t = boot('design-duel', dlRound());
  t.key('a');
  assert.equal(dlReasons(t).length, 4);
  t.key('3'); t.key('Enter'); // right design, right reason, next
  assert.match(t.root.textContent, /Design B2/);
  t.key('b'); t.key('a'); t.key('Enter');
  t.key('1'); t.key('d'); t.key('Enter');
  assert.equal(t.finished.length, 1);
  assert.equal(t.results[0].xp, 10 + 10 + 10);
  assert.equal(t.finished[0].got, 3);
});

// ------------------------------------------------------------------ escape room

const erRound = () => ({
  zone: 'trips', mode: 'practice', labels: { f1: { label: 'Pay out' } },
  puzzles: [
    { kind: 'role', role: 'Rider', action: 'cancel another rider trip', answer: core.encode('deny'), why: core.encode('Only the owner may cancel.') },
    { kind: 'flow', flow: 'f1', cards: [{ id: 'c', label: 'Store it' }, { id: 'a', label: 'Tap pay' }, { id: 'b', label: 'Charge' }], answer: core.encode(['a', 'b', 'c']) },
    { kind: 'failure', failure: 'Riders see old prices', logs: ['Cache hit', 'Price stale'], cards: [{ id: 'p', label: 'Price cache' }, { id: 'q', label: 'Login page' }, { id: 'r', label: 'Map tiles' }], answer: core.encode('p') },
  ],
});
const erStep = (t, text) => all(t, '.er-step').find((b) => b.textContent.endsWith(text));
const erPick = (t, text) => all(t, '.er-pick').find((b) => b.textContent.endsWith(text));
const erNext = (t) => t.root.querySelector('.er-next');
const erDoor = (t) => t.root.querySelector('.er-door');

test('escape-room: three puzzles open the door at 3/3 with a fanfare; the answers decode only on a move', () => {
  const t = boot('escape-room', erRound());
  assert.equal(erDoor(t).classList.contains('open'), false);
  assert.equal(t.decodes(), 0);
  assert.match(t.root.textContent, /Rider/);
  assert.ok(all(t, '.er-allow, .er-deny, .er-step, .er-pick').every((b) => !b.hasAttribute('data-id') && !b.hasAttribute('data-answer')), 'nothing about the answers in the DOM');
  t.root.querySelector('.er-deny').click();
  assert.equal(t.decodes(), 2, 'verdict and reason decoded on the call');
  assert.match(t.root.textContent, /Only the owner may cancel/);
  erNext(t).click();
  erStep(t, 'Tap pay').click(); erStep(t, 'Charge').click();
  assert.equal(erDoor(t).classList.contains('open'), false);
  erStep(t, 'Store it').click();
  erNext(t).click();
  assert.match(t.root.textContent, /Riders see old prices/);
  assert.equal(erDoor(t).classList.contains('open'), false, 'still shut with a puzzle to go');
  erPick(t, 'Price cache').click();
  assert.equal(erDoor(t).classList.contains('open'), true);
  assert.equal(t.sounds.filter((s) => s === 'levelup').length, 1);
  assert.equal(t.finished.length, 0);
  erNext(t).click();
  assert.equal(t.finished.length, 1);
  assert.equal(t.finished[0].got, 3);
  assert.equal(t.finished[0].of, 3);
  assert.equal(t.results[0].xp, 45);
  assert.equal(t.finished[0].game, 'escape-room');
});

test('escape-room: a wrong verdict fails a role puzzle and two slips fail a flow, the door stays shut', () => {
  const t = boot('escape-room', erRound());
  t.root.querySelector('.er-allow').click(); // wrong
  assert.equal(t.shakes(), 1);
  erNext(t).click();
  erStep(t, 'Charge').click(); erStep(t, 'Store it').click(); // two slips
  assert.match(t.root.textContent, /Tap pay.*Charge.*Store it/);
  erNext(t).click();
  erPick(t, 'Price cache').click();
  assert.equal(erDoor(t).classList.contains('open'), false);
  erNext(t).click();
  assert.equal(t.finished[0].got, 1);
  assert.equal(t.results[0].xp, 15);
  assert.deepEqual(plain(t.finished[0].missed), ['0', '1']);
});

test('escape-room: arrows judge the role, digits pick steps and suspects, Enter moves on', () => {
  const t = boot('escape-room', erRound());
  t.key('ArrowLeft'); // deny
  t.key('Enter');
  t.key('2'); t.key('3'); t.key('1'); // Tap pay, Charge, Store it
  t.key('Enter');
  t.key('1');
  t.key('Enter');
  assert.equal(t.finished.length, 1);
  assert.equal(t.finished[0].got, 3);
});

// ------------------------------------------------------------------ teach back

const tbRound = () => ({ zone: 'trips', mode: 'practice', screen: 's1', labels: { s1: { label: 'Trip screen', kind: 'surface' } } });
const tbBox = (t) => t.root.querySelector('.tb-text');
const tbSay = (t, text) => { tbBox(t).value = text; t.root.querySelector('.tb-send').click(); };
const tbLink = (mode) => {
  const sent = [], subs = [];
  return { mode, sent, subs, send(type, payload) { sent.push({ type, payload }); return Promise.resolve(true); },
    onData(cb) { subs.push(cb); return () => { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); }; }, onMode() { return () => {}; } };
};

test('teach-back: file mode puts the explanation in the result; 1 of 1, no XP from the game itself', () => {
  const t = boot('teach-back', tbRound(), { link: tbLink('file') });
  assert.match(t.root.textContent, /product manager/);
  tbSay(t, '   ');
  assert.equal(t.finished.length, 0, 'an empty explanation is not sent');
  tbSay(t, 'You see your trip and can cancel it. Cancelling tells the driver.');
  assert.equal(t.finished.length, 1);
  assert.deepEqual(plain(t.finished[0].text), { q1: 'You see your trip and can cancel it. Cancelling tells the driver.' });
  assert.equal(t.finished[0].got, 1);
  assert.equal(t.finished[0].of, 1);
  assert.equal(t.finished[0].game, 'teach-back');
  assert.equal(t.finished[0].hintsUsed, 0);
  assert.equal(t.results[0].xp, 0);
});

test('teach-back: live mode asks Claude and waits for the grade, shows the note; Enter sends, Shift+Enter adds a line', () => {
  const link = tbLink('live');
  const t = boot('teach-back', tbRound(), { link });
  tbBox(t).value = 'Two sentences here.';
  tbBox(t).dispatchEvent(t.env.event('keydown', { key: 'Enter', shiftKey: true }));
  assert.equal(link.sent.length, 0, 'Shift+Enter adds a line');
  tbBox(t).dispatchEvent(t.env.event('keydown', { key: 'Enter' }));
  assert.deepEqual(plain(link.sent[0]), { type: 'ask', payload: { round: 'trips-teach-back-1', q: 'q1', text: 'Two sentences here.' } });
  assert.equal(t.finished.length, 0, 'waits for Claude');
  t.w.OWNIT_FEEDBACK = { 'trips-teach-back-1': { grades: { q1: 'partial' }, notes: { q1: 'Say what the rider gets.' } } };
  link.subs.slice().forEach((f) => f({ file: 'data/feedback-trips-teach-back-1.js' }));
  assert.match(t.root.textContent, /Say what the rider gets/);
  assert.equal(t.finished.length, 0);
  t.key('Enter');
  assert.equal(t.finished.length, 1);
  assert.deepEqual(plain(t.finished[0].text), { q1: 'Two sentences here.' });
  assert.equal(t.finished[0].grades.q1, 'partial');
});

test('v2.2 pack games refuse a malformed round', () => {
  const d = dlRound(); d.decisions[1].reasons = ['one'];
  assert.throws(() => boot('design-duel', d), /malformed|cannot be played/i);
  const e = erRound(); e.puzzles[1].kind = 'riddle';
  assert.throws(() => boot('escape-room', e), /malformed|cannot be played/i);
  assert.throws(() => boot('escape-room', Object.assign(erRound(), { puzzles: erRound().puzzles.slice(0, 2) })), /malformed|cannot be played/i);
  assert.throws(() => boot('teach-back', { zone: 'trips' }), /malformed|cannot be played/i);
});
