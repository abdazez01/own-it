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
