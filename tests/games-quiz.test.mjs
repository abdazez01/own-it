import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createEnv } from './fake-dom.mjs';

const require = createRequire(import.meta.url);
const core = require('../own-it/assets/core.js');
const ASSETS = new URL('../own-it/assets/', import.meta.url);
const FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js'];

const live = [];
after(() => live.forEach((f) => { try { f(); } catch { /* already cleaned */ } }));

const ANSWERS = [1, 0, 3, 2, 1];
function makeRound(mode = 'practice') {
  return {
    zone: 'trips', mode,
    questions: ANSWERS.map((a, i) => ({
      q: `Question ${i}?`,
      options: [0, 1, 2, 3].map((j) => ({ text: `Q${i} option ${j}`, why: a === j ? `Q${i} right because ${j}` : `Q${i} not ${j} because` })),
      answer: core.encode(a),
      ...(i === 0 ? { peek: 'src/trips.js:10' } : {}),
    })),
  };
}

function boot({ mode = 'practice', exam = false } = {}) {
  const env = createEnv({ reduced: true });
  env.load(...FILES);
  const w = env.window;
  w.TextDecoder = TextDecoder;
  vm.runInContext(readFileSync(new URL('core.js', ASSETS), 'utf8'), env.ctx, { filename: 'core.js' });
  let decodes = 0;
  const real = w.OwnItCore.decode;
  w.OwnItCore.decode = (s) => { decodes++; return real(s); };
  const sounds = [];
  w.OwnIt.audio = { play: (n) => sounds.push(n) };
  let shakes = 0, confetti = 0;
  w.OwnIt.juice.shake = () => { shakes++; };
  w.OwnIt.juice.confetti = () => { confetti++; };
  if (exam) w.OwnIt.mode = 'exam';
  vm.runInContext(readFileSync(new URL('games/quiz.js', ASSETS), 'utf8'), env.ctx, { filename: 'quiz.js' });
  const root = env.document.createElement('div');
  env.document.body.appendChild(root);
  const finished = [];
  const ctx = {
    game: 'quiz', roundId: 'trips-quiz-1', root, router: { go() {} }, toast() {},
    keys: { on: (k, f) => w.OwnIt.keys.on(k, f, 'quiz') },
    finish: (p) => finished.push(p),
  };
  w.OwnIt.keys.setScope('quiz');
  const round = makeRound(mode);
  const cleanup = w.OwnIt.games.get('quiz').play(root, round, ctx);
  live.push(cleanup);
  const key = (k) => env.document.dispatchEvent(env.event('keydown', { key: k }));
  const opts = () => root.querySelectorAll('.answer');
  return { env, w, root, key, opts, sounds, finished, cleanup, round, counts: { decodes: () => decodes, shakes: () => shakes, confetti: () => confetti } };
}

test('registers as quiz with keys', () => {
  const { w } = boot();
  const def = w.OwnIt.games.get('quiz');
  assert.equal(def.id, 'quiz');
  assert.ok(def.keys.length >= 3);
});

test('answers decode only on answer', () => {
  const t = boot();
  assert.equal(t.counts.decodes(), 0);
  assert.ok(!JSON.stringify(t.root.textContent).includes(t.round.questions[0].answer));
  t.key('2');
  assert.equal(t.counts.decodes(), 1);
});

test('key 2 selects option 2', () => {
  const t = boot();
  t.key('2');
  const sel = t.opts().map((o, i) => [o, i]).filter(([o]) => o.classList.contains('picked'));
  assert.equal(sel.length, 1);
  assert.equal(sel[0][1], 1);
  t.key('Enter'); // next
  t.key('c');
  assert.equal(t.opts().filter((o) => o.classList.contains('picked')).length, 1);
  assert.ok(t.opts()[2].classList.contains('picked'));
});

test('wrong answer shows why-not text, then the right option why', () => {
  const t = boot();
  t.key('1'); // right is index 1, so this is wrong
  const text = t.root.textContent;
  assert.match(text, /Q0 not 0 because/);
  assert.match(text, /Q0 right because 1/);
  assert.equal(t.counts.shakes(), 1);
  assert.ok(t.sounds.includes('wrong'));
  assert.ok(t.opts()[1].classList.contains('right'));
  assert.ok(t.opts()[0].classList.contains('wrong'));
});

test('right answer: correct sound, confetti, why line, +10 XP', () => {
  const t = boot();
  t.key('2');
  assert.ok(t.sounds.includes('correct'));
  assert.equal(t.counts.confetti(), 1);
  assert.match(t.root.textContent, /Q0 right because 1/);
  assert.match(t.root.textContent, /\+10 XP/);
});

test('answering is locked after the first pick', () => {
  const t = boot();
  t.key('1');
  t.key('2');
  assert.equal(t.opts().filter((o) => o.classList.contains('picked')).length, 1);
});

test('payload got/of/missed correct after 5, hintsUsed attached', () => {
  const t = boot();
  // answers: 1,0,3,2,1 ; give right,wrong,right,wrong,right
  const picks = ['2', '2', '4', '1', '2']; // idx 1 ok, 1 vs 0 wrong, 3 ok, 0 vs 2 wrong, 1 ok
  picks.forEach((k) => { t.key(k); t.key('Enter'); });
  assert.equal(t.finished.length, 1);
  const p = t.finished[0];
  assert.equal(p.got, 3);
  assert.equal(p.of, 5);
  assert.equal(JSON.stringify(p.missed), '["1","3"]');
  assert.equal(p.hintsUsed, 0);
  assert.equal(p.id, 'trips-quiz-1');
  assert.equal(p.mode, 'practice');
  assert.ok(t.root.parentNode || t.env.document.body.querySelector('.result-card'));
});

test('hint is confirmed and counted; exam mode has no hints and no why until the end', () => {
  const t = boot();
  t.key('h');
  const dlg = t.env.document.body.querySelector('.dialog');
  assert.ok(dlg);
  dlg.querySelectorAll('button').find((b) => /Show hint/.test(b.textContent)).click();
  assert.match(t.env.document.body.textContent, /src\/trips\.js:10/);
  dlg.querySelectorAll('button').find((b) => /Got it/.test(b.textContent)).click();
  ['1', '1', '1', '1', '1'].forEach((k) => { t.key(k); t.key('Enter'); });
  assert.equal(t.finished[0].hintsUsed, 1);

  const e = boot({ mode: 'exam' });
  e.key('h');
  assert.equal(e.env.document.body.querySelector('.dialog'), null);
  e.key('1');
  assert.doesNotMatch(e.root.textContent, /because/);
  assert.equal(e.counts.confetti(), 0);
  assert.equal(e.counts.shakes(), 0);
  for (let i = 0; i < 4; i++) { e.key('Enter'); e.key('1'); }
  e.key('Enter');
  assert.equal(e.finished.length, 1);
  assert.match(e.env.document.body.textContent, /because/);
});

test('cleanup stops auto advance and unbinds keys', () => {
  const t = boot();
  t.key('2');
  assert.equal(typeof t.cleanup, 'function');
  t.cleanup();
  t.key('Enter');
  assert.equal(t.finished.length, 0);
});

test('layout hooks: answers grid, one button per option, no innerHTML use', () => {
  const t = boot();
  assert.equal(t.root.querySelectorAll('.answers').length, 1);
  assert.equal(t.opts().length, 4);
  assert.equal(t.root.querySelectorAll('.qdot').length, 5);
  assert.doesNotMatch(readFileSync(new URL('games/quiz.js', ASSETS), 'utf8'), /innerHTML|outerHTML|insertAdjacentHTML/);
});
