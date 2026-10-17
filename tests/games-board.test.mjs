import { test, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createEnv, FakeElement } from './fake-dom.mjs';

const require = createRequire(import.meta.url);
const core = require('../own-it/assets/core.js');
const ASSETS = new URL('../own-it/assets/', import.meta.url);
const FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js', 'gamekit.js'];

const live = [];
after(() => live.forEach((f) => { try { f(); } catch { /* already cleaned */ } }));

function boot(game, round, { link, beforePlay } = {}) {
  const env = createEnv({ reduced: true });
  env.load(...FILES);
  const w = env.window;
  w.TextDecoder = TextDecoder;
  vm.runInContext(readFileSync(new URL('core.js', ASSETS), 'utf8'), env.ctx, { filename: 'core.js' });
  const sounds = [];
  w.OwnIt.audio = { play: (n) => sounds.push(n) };
  let shakes = 0;
  w.OwnIt.juice.shake = () => { shakes++; };
  w.OwnIt.juice.confetti = () => {};
  vm.runInContext(readFileSync(new URL(`games/${game}.js`, ASSETS), 'utf8'), env.ctx, { filename: `${game}.js` });
  const root = env.document.createElement('div');
  env.document.body.appendChild(root);
  const finished = [];
  const ctx = {
    game, roundId: `trips-${game}-1`, root, router: { go() {} }, toast() {},
    keys: { on: (k, f) => w.OwnIt.keys.on(k, f, game) },
    finish: (p) => finished.push(p), link,
  };
  w.OwnIt.keys.setScope(game);
  if (beforePlay) beforePlay(w);
  const cleanup = w.OwnIt.games.get(game).play(root, round, ctx);
  live.push(cleanup);
  const key = (k) => env.document.dispatchEvent(env.event('keydown', { key: k }));
  return { env, w, root, key, sounds, finished, ctx, cleanup, counts: { shakes: () => shakes } };
}

// ------------------------------------------------------------------ whiteboard

const KIND = { a: 'surface', b: 'actor', c: 'component', d: 'component' };
const CARDS = ['a', 'b', 'c', 'd'].map((id) => ({ id, label: `Part ${id}`, kind: KIND[id], ref: `src/${id}.js:1` }));
const EDGES = [
  { id: 'e1', from: 'a', to: 'c' },
  { id: 'e2', from: 'b', to: 'c' },
  { id: 'e3', from: 'c', to: 'd' },
];
function wbRound(over = {}) {
  return { zone: 'trips', mode: 'practice', cards: CARDS, answer: core.encode({ edges: EDGES }), labels: {}, ...over };
}
const card = (t, id) => t.root.querySelector(`.wb-card[data-id="${id}"]`);
const edges = (t) => Array.from(t.root.querySelectorAll('.wb-edge'));
function draw(t, from, to) { card(t, from).click(); card(t, to).click(); }

test('layered layout puts sources left, from card kinds and not from the answer', () => {
  const t = boot('whiteboard', wbRound());
  const lay = t.w.OwnIt.whiteboardLayout(CARDS);
  assert.equal(lay.a.layer, 0);
  assert.equal(lay.b.layer, 0);
  assert.equal(lay.c.layer, 1);
  assert.equal(lay.d.layer, 1);
  assert.deepEqual([lay.a.row, lay.b.row, lay.c.row, lay.d.row], [0, 1, 0, 1]); // label order
  assert.deepEqual(t.w.OwnIt.whiteboardLayout(CARDS), lay); // deterministic
  assert.equal(t.w.OwnIt.whiteboardLayout([{ id: 'x', label: 'X' }]).x.layer, 1); // unknown kind
});

test('the answer is decoded only when the map is checked', () => {
  const env = { n: 0 };
  const t = boot('whiteboard', wbRound(), { beforePlay: (w) => { const real = w.OwnItCore.decode; w.OwnItCore.decode = (x) => { env.n++; return real(x); }; } });
  draw(t, 'a', 'c');
  assert.equal(env.n, 0);
  t.root.querySelector('.wb-check').click();
  assert.equal(env.n, 1);
});

test('an answer that cannot be decoded shows a notice at Check and grades nothing', () => {
  const t = boot('whiteboard', wbRound({ answer: 'not-an-answer' }));
  draw(t, 'a', 'c');
  t.root.querySelector('.wb-check').click();
  assert.match(t.root.textContent, /This board can't be checked\. Ask Claude to rebuild it\./);
  assert.equal(t.root.querySelectorAll('.wb-edge.good').length, 0);
  assert.ok(!t.root.querySelector('.wb-check').hasAttribute('hidden'));
  assert.equal(t.finished.length, 0);
});

function withBoardWidth(width, fn) {
  const real = FakeElement.prototype.getBoundingClientRect;
  FakeElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width, height: 40 });
  try { return fn(); } finally { FakeElement.prototype.getBoundingClientRect = real; }
}

test('cards sit in layer order on the board: sources left of sinks on wide screens, top to bottom on phones', () => {
  withBoardWidth(900, () => {
    const t = boot('whiteboard', wbRound());
    const left = (id) => parseFloat(card(t, id).style.left);
    assert.ok(left('a') < left('c'));
    assert.ok(left('a') < left('d'));
  });
  withBoardWidth(360, () => {
    const t = boot('whiteboard', wbRound());
    const top = (id) => parseFloat(card(t, id).style.top);
    assert.ok(top('a') < top('c'));
    assert.ok(top('a') < top('d'));
    for (const id of ['a', 'b', 'c', 'd']) assert.ok(parseFloat(card(t, id).style.left) + parseFloat(card(t, id).style.width) <= 360);
  });
});

test('phone board: five cards in one layer all fit inside 360px, none narrower than 88px', () => {
  const many = ['m', 'n', 'o', 'p', 'q'].map((id) => ({ id, label: `Surface ${id}`, kind: 'surface' }));
  withBoardWidth(360, () => {
    const t = boot('whiteboard', wbRound({ cards: many }));
    const board = t.root.querySelector('.wb-board');
    for (const c of many) {
      const el = card(t, c.id);
      const x = parseFloat(el.style.left), w = parseFloat(el.style.width), y = parseFloat(el.style.top), h = parseFloat(el.style.height);
      assert.ok(x >= 0 && x + w <= 360, `${c.id} within width`);
      assert.ok(w >= 88, `${c.id} wide enough`);
      assert.ok(y + h <= parseFloat(board.style.height), `${c.id} within height`);
    }
    // no two cards overlap
    const rects = many.map((c) => { const e = card(t, c.id); return [parseFloat(e.style.left), parseFloat(e.style.top), parseFloat(e.style.width), parseFloat(e.style.height)]; });
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const [x1, y1, w1, h1] = rects[i], [x2, y2, w2, h2] = rects[j];
      assert.ok(x1 + w1 <= x2 || x2 + w2 <= x1 || y1 + h1 <= y2 || y2 + h2 <= y1, `${i} and ${j} overlap`);
    }
  });
});

test('arrow create/delete', () => {
  const t = boot('whiteboard', wbRound());
  assert.equal(edges(t).length, 0);
  draw(t, 'a', 'c');
  assert.equal(edges(t).length, 1);
  draw(t, 'a', 'c'); // same arrow again is not duplicated
  assert.equal(edges(t).length, 1);
  card(t, 'c').click();
  card(t, 'c').click(); // same card twice only cancels
  assert.equal(edges(t).length, 1);
  edges(t)[0].click(); // select the arrow
  t.key('Delete');
  assert.equal(edges(t).length, 0);
  draw(t, 'b', 'c');
  assert.equal(edges(t).length, 1);
  // tap alternative: remove button in the arrow list
  t.root.querySelector('.wb-remove').click();
  assert.equal(edges(t).length, 0);
});

test('arrow keys move focus between cards, Enter on a focused card picks it', () => {
  withBoardWidth(900, () => {
    const t = boot('whiteboard', wbRound());
    card(t, 'a').focus();
    t.key('ArrowRight');
    assert.equal(t.env.document.activeElement.getAttribute('data-id'), 'c');
  });
});

test('check grades with gradeComponent and reveals good, ghost and crossed arrows', () => {
  const t = boot('whiteboard', wbRound());
  draw(t, 'a', 'c'); // right
  draw(t, 'd', 'a'); // wrong
  t.root.querySelector('.wb-check').click();
  assert.equal(t.root.querySelectorAll('.wb-edge.good').length, 1);
  assert.equal(t.root.querySelectorAll('.wb-edge.wrong').length, 1);
  assert.equal(t.root.querySelectorAll('.wb-edge.ghost').length, 2); // b-c and c-d missing
  assert.ok(t.root.querySelectorAll('.wb-cross').length >= 1);
  assert.ok(t.sounds.includes('wrong'));
  // editing is locked after the check
  draw(t, 'b', 'c');
  assert.equal(t.root.querySelectorAll('.wb-edge.good').length, 1);
  t.root.querySelector('.wb-result').click();
  assert.equal(t.finished.length, 1);
  const p = JSON.parse(JSON.stringify(t.finished[0])); // plain objects: the page runs in another realm
  assert.equal(p.game, 'whiteboard');
  assert.equal(p.got, 1);
  assert.equal(p.of, 3);
  assert.deepEqual(p.missed, ['e2', 'e3']);
  assert.deepEqual(p.wrong, [['d', 'a']]);
});

test('perfect map plays correct', () => {
  const t = boot('whiteboard', wbRound());
  draw(t, 'a', 'c'); draw(t, 'b', 'c'); draw(t, 'c', 'd');
  t.root.querySelector('.wb-check').click();
  assert.ok(t.sounds.includes('correct'));
  assert.equal(t.root.querySelectorAll('.wb-edge.good').length, 3);
});

test('the answer is not in the page text before checking', () => {
  const t = boot('whiteboard', wbRound());
  assert.ok(!t.root.textContent.includes(core.encode({ edges: EDGES })));
});

// ------------------------------------------------------------------ boss battle

const BOSS = {
  zone: 'trips', mode: 'practice',
  questions: ['why', 'malicious', 'structure', 'fails', 'term'].map((kind, i) => ({ q: `Boss question ${i + 1}?`, kind })),
};
function liveLink() {
  const sent = [];
  const subs = [];
  return {
    mode: 'live', sent, subs,
    send(type, payload) { sent.push({ type, payload }); return Promise.resolve(true); },
    onData(cb) { subs.push(cb); return () => { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); }; },
    onMode() { return () => {}; },
  };
}
const answerBox = (t) => t.root.querySelector('.boss-answer');
function say(t, text) { answerBox(t).value = text; t.root.querySelector('.boss-send').click(); }
const FILE = 'data/feedback-trips-boss-battle-1.js';
// Canonical feedback: window.OWNIT_FEEDBACK[round] = { grades: { q1: 'solid', ... } }, then the link reports the rewritten file.
function grade(t, q, g, link) {
  const cur = (t.w.OWNIT_FEEDBACK && t.w.OWNIT_FEEDBACK['trips-boss-battle-1']) || { grades: {} };
  t.w.OWNIT_FEEDBACK = { ...(t.w.OWNIT_FEEDBACK || {}), 'trips-boss-battle-1': { ...cur, grades: { ...cur.grades, [q]: g } } };
  link.subs.slice().forEach((f) => f({ file: FILE }));
}

test('boss applies solid as hit, miss as life loss', () => {
  const link = liveLink();
  const t = boot('boss-battle', BOSS, { link });
  const hpText = () => t.root.querySelector('.boss-hp').getAttribute('aria-label');
  const lives = () => t.root.querySelectorAll('.boss-life').length - t.root.querySelectorAll('.boss-life.lost').length;
  assert.equal(lives(), 3);
  assert.match(hpText(), /100/);
  say(t, 'because it is simple');
  assert.deepEqual(JSON.parse(JSON.stringify(link.sent[0])), { type: 'ask', payload: { round: 'trips-boss-battle-1', q: 'q1', text: 'because it is simple' } });
  grade(t, 'q1', 'solid', link);
  assert.match(hpText(), /80/);
  assert.ok(t.sounds.includes('correct'));
  assert.equal(lives(), 3);
  t.root.querySelector('.boss-next').click();
  say(t, 'no idea');
  grade(t, 'q2', 'miss', link);
  assert.equal(lives(), 2);
  assert.ok(t.sounds.includes('wrong'));
  assert.equal(t.counts.shakes(), 1);
  assert.match(hpText(), /80/);
  t.root.querySelector('.boss-next').click();
  say(t, 'half');
  grade(t, 'q3', 'partial', link);
  assert.match(hpText(), /70/);
});

test('boss ends after three misses and sends the payload', () => {
  const link = liveLink();
  const t = boot('boss-battle', BOSS, { link });
  for (let i = 1; i <= 3; i++) {
    say(t, `answer ${i}`);
    grade(t, `q${i}`, 'miss', link);
    if (i < 3) t.root.querySelector('.boss-next').click();
  }
  assert.equal(t.finished.length, 1);
  const p = JSON.parse(JSON.stringify(t.finished[0]));
  assert.equal(p.game, 'boss-battle');
  assert.equal(p.got, 0);
  assert.equal(p.of, 5);
  assert.deepEqual(p.grades, { q1: 'miss', q2: 'miss', q3: 'miss' });
  assert.equal(p.text.q2, 'answer 2');
});

test('five solid answers defeat the boss', () => {
  const link = liveLink();
  const t = boot('boss-battle', BOSS, { link });
  for (let i = 1; i <= 5; i++) {
    say(t, `answer ${i}`);
    grade(t, `q${i}`, 'solid', link);
    if (i < 5) t.root.querySelector('.boss-next').click();
  }
  assert.equal(t.finished.length, 1);
  assert.equal(t.finished[0].got, 5);
  assert.match(t.root.querySelector('.boss-hp').getAttribute('aria-label'), /0/);
});

test('empty answers are not sent', () => {
  const link = liveLink();
  const t = boot('boss-battle', BOSS, { link });
  say(t, '   ');
  assert.equal(link.sent.length, 0);
});

test('file mode collects text q1..q5 into one result', () => {
  const t = boot('boss-battle', BOSS, { link: { mode: 'file', send() { return Promise.resolve(true); }, onData() { return () => {}; } } });
  for (let i = 1; i <= 5; i++) {
    say(t, `typed ${i}`);
    if (i < 5) t.root.querySelector('.boss-next').click();
  }
  assert.equal(t.finished.length, 1);
  const p = JSON.parse(JSON.stringify(t.finished[0]));
  assert.deepEqual(p.text, { q1: 'typed 1', q2: 'typed 2', q3: 'typed 3', q4: 'typed 4', q5: 'typed 5' });
  assert.equal(p.game, 'boss-battle');
});

test('boss HP is five flap tiles and lives are three flag tiles', () => {
  const link = liveLink();
  const t = boot('boss-battle', BOSS, { link });
  const tiles = () => Array.from(t.root.querySelector('.boss-hp').children).map((x) => x.textContent);
  assert.equal(tiles().length, 5);
  assert.equal(tiles().filter((x) => x === '■').length, 5);
  say(t, 'x');
  grade(t, 'q1', 'solid', link);
  assert.equal(tiles().filter((x) => x === '■').length, 4);
  assert.equal(t.root.querySelectorAll('.flap-tile.boss-life').length, 3);
});

test('a grade already in the feedback file is ignored until the link reports new data after the ask', () => {
  const link = liveLink();
  const t = boot('boss-battle', BOSS, { link, beforePlay: (w) => { w.OWNIT_FEEDBACK = { 'trips-boss-battle-1': { grades: { q1: 'solid' } } }; } });
  say(t, 'my answer');
  assert.match(t.root.querySelector('.boss-hp').getAttribute('aria-label'), /100/);
  assert.equal(t.root.querySelectorAll('.boss-next').length, 1);
  assert.ok(t.root.querySelector('.boss-next').hasAttribute('hidden'));
  link.subs.slice().forEach((f) => f({ file: 'data/other.js' })); // an unrelated file changed
  assert.match(t.root.querySelector('.boss-hp').getAttribute('aria-label'), /100/);
  link.subs.slice().forEach((f) => f({ file: FILE }));
  assert.match(t.root.querySelector('.boss-hp').getAttribute('aria-label'), /80/);
});

test('a failed ask puts the question back so the answer can be sent again', async () => {
  const link = liveLink();
  link.send = () => Promise.resolve(false);
  const t = boot('boss-battle', BOSS, { link });
  say(t, 'my answer');
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(!answerBox(t).hasAttribute('disabled'));
  assert.ok(!t.root.querySelector('.boss-send').hasAttribute('hidden'));
});

test('Enter in the answer box sends once and does not also go to the next question', () => {
  const t = boot('boss-battle', BOSS, { link: { mode: 'file', send() { return Promise.resolve(true); }, onData() { return () => {}; } } });
  answerBox(t).value = 'typed 1';
  answerBox(t).dispatchEvent(t.env.event('keydown', { key: 'Enter' }));
  assert.match(t.root.textContent, /Boss question 1\?/);
  assert.ok(!t.root.querySelector('.boss-next').hasAttribute('hidden'));
  t.root.querySelector('.boss-next').click();
  assert.match(t.root.textContent, /Boss question 2\?/);
});

test('after 60 s of waiting a Skip question button appears and counts as a miss', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const link = liveLink();
    const t = boot('boss-battle', BOSS, { link });
    say(t, 'my answer');
    const skip = t.root.querySelector('.boss-skip');
    assert.ok(skip.hasAttribute('hidden'));
    mock.timers.tick(60000);
    assert.ok(!skip.hasAttribute('hidden'));
    skip.click();
    assert.equal(t.root.querySelectorAll('.boss-life.lost').length, 1);
    assert.ok(t.sounds.includes('wrong'));
  } finally { mock.timers.reset(); }
});
