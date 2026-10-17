import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from './fake-dom.mjs';
import { listGames } from '../own-it/scripts/lib/games.mjs';

const FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js', 'home.js'];
const BUILT = ['quiz', 'screen-tour', 'guess-the-screen', 'quests', 'whiteboard', 'boss-battle'];
const PROGRESS = { xp: 340, zones: {
  trips: { name: 'Trips', rungs: { words: 'cleared', map: 'open', trace: 'locked', break: 'locked', boss: 'locked' }, claimed: false, fogged: false, weakSpots: [] },
  locks: { name: 'Locks', rungs: { words: 'cleared', map: 'cleared', trace: 'cleared', break: 'cleared', boss: 'cleared' }, claimed: true, fogged: false, weakSpots: [] },
} };

const go = (w) => Array.from(w.document.body.querySelectorAll('button')).find((b) => b.textContent === 'Start').click();

function boot({ built = BUILT, progress = PROGRESS, recs, rounds, reduced = true } = {}) {
  const env = createEnv({ reduced });
  env.load(...FILES);
  const w = env.window;
  w.OWNIT_GAMES = listGames();
  if (progress) w.OWNIT_PROGRESS = progress;
  if (recs) w.OWNIT_RECS = recs;
  if (rounds) w.OWNIT_ROUNDS = rounds;
  const stage = env.document.createElement('div');
  stage.setAttribute('id', 'stage');
  env.document.body.appendChild(stage);
  built.forEach((id) => w.OwnIt.register({ id, name: id, keys: [], play() {} }));
  return { env, w, stage, home: () => w.OwnIt.router.go('home') };
}

test('home renders one library tile per game, 6 enabled', () => {
  const { stage, home } = boot();
  home();
  const tiles = Array.from(stage.querySelectorAll('.tile-game'));
  assert.equal(tiles.length, listGames().length);
  assert.equal(tiles.filter((t) => !t.hasAttribute('disabled')).length, 6);
  const off = tiles.find((t) => t.hasAttribute('disabled'));
  assert.match(off.textContent, /Coming in a later update/);
  assert.ok(tiles.every((t) => t.querySelector('svg')), 'every tile has a logo');
});

test('missing recs.js renders empty recommended state', () => {
  const { stage, home } = boot();
  home();
  assert.equal(stage.querySelectorAll('.card-rec').length, 0);
  assert.equal(stage.querySelectorAll('.recs-empty').length, 1);
});

test('missing progress.js renders board empty state', () => {
  const { stage, home } = boot({ progress: null });
  home();
  assert.equal(stage.querySelectorAll('.board-empty').length, 1);
  assert.equal(stage.querySelectorAll('.board-row').length, 0);
});

test('recommended cards show Ready when a round exists, else Ask Claude', () => {
  const { stage, home } = boot({
    recs: [{ game: 'quiz', zone: 'trips', reason: 'Your app talks about trips.' }, { game: 'boss-battle', zone: 'trips', reason: 'Defend it.' }],
    rounds: { 'trips-quiz-1': {} },
  });
  home();
  const cards = stage.querySelectorAll('.card-rec');
  assert.equal(cards.length, 2);
  assert.match(cards[0].textContent, /Ready/);
  assert.match(cards[1].textContent, /Ask Claude/);
});

test('board lists zones with rung cells and a status', () => {
  const { stage, home } = boot();
  home();
  const rows = Array.from(stage.querySelectorAll('.board-row')).filter((r) => r.hasAttribute('data-zone'));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].querySelectorAll('.rung-cell').length, 5);
  assert.equal(Array.from(rows[0].querySelectorAll('.rung-cell')).filter((c) => c.classList.contains('c')).length, 1);
  assert.equal(Array.from(rows[1].querySelectorAll('.flap')).filter((f) => f.getAttribute('aria-label') === 'ON TIME').length, 1);
});

test('pick in file mode copies command', async () => {
  const { w, stage, home } = boot();
  let copied = null;
  w.navigator.clipboard.writeText = async (t) => { copied = t; };
  home();
  Array.from(stage.querySelectorAll('.tile-game')).find((t) => t.getAttribute('data-game') === 'quiz').click();
  go(w);
  assert.equal(copied, 'play quiz trips --level medium');
  await new Promise((r) => setTimeout(r, 0));
});

test('pick in live mode sends the event and shows the building state', () => {
  const { w, stage, home } = boot();
  const sent = [];
  w.OwnIt.link.mode = 'live';
  w.OwnIt.link.onData = () => () => {}; // no polling in this test
  w.OwnIt.link.send = (type, payload) => { sent.push([type, payload]); return Promise.resolve(true); };
  home();
  Array.from(stage.querySelectorAll('.tile-game')).find((t) => t.getAttribute('data-game') === 'quiz').click();
  go(w);
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [['pick', { game: 'quiz', zone: 'trips', mode: 'practice', level: 'medium' }]]);
  assert.equal(stage.querySelectorAll('.building').length, 1);
  w.OwnIt.stopBuilding();
});

test('pick with a ready round opens the game', () => {
  const { w, home } = boot({ rounds: { 'trips-quiz-1': { q: 1 } } });
  let played = null;
  w.OwnIt.register({ id: 'quiz', name: 'Quiz', keys: [], play(root, round) { played = round; } });
  home();
  w.OwnIt.home._pick('quiz', 'trips');
  go(w);
  assert.equal(played.q, 1);
});

test('logo parser keeps safe shapes only', () => {
  const { w } = boot();
  const svg = w.OwnIt.parseSvg('<svg viewBox="0 0 24 24"><path d="M0 0" onclick="x()"/><script>bad</script><g><circle cx="1" cy="2" r="3"/></g></svg>');
  const kids = Array.from(svg.querySelectorAll('path, circle, script, g'));
  assert.equal(kids.length, 3);
  assert.equal(kids.find((k) => k.tagName === 'PATH').hasAttribute('onclick'), false);
});

test('shell builds header, area and side; result card sends the result', () => {
  const { w, stage } = boot();
  const sent = [];
  w.OwnIt.link.send = (type, payload) => { sent.push(type + ':' + payload.id); return Promise.resolve(true); };
  let shell = null;
  w.OwnIt.register({ id: 'quiz', name: 'Quiz', keys: [], play(root, round, ctx) { shell = w.OwnIt.shell(root, ctx, { zone: 'trips', total: 5 }); shell.result({ got: 3, total: 5, xp: 30, payload: { id: 'trips-quiz-1' } }); } });
  w.OwnIt.router.go({ game: 'quiz', roundId: 'trips-quiz-1' });
  assert.ok(shell.area && shell.side);
  assert.equal(stage.querySelectorAll('.shell-head').length, 1);
  assert.deepEqual(sent, ['result:trips-quiz-1']);
  assert.ok(w.document.body.querySelectorAll('.result-card').length === 1);
});

// ---- fix round 1

test('footer copy is exact', () => {
  const { stage, home } = boot();
  home();
  const f = stage.querySelector('.foot-note');
  assert.equal(f.textContent, 'Everything own-it creates lives in .own-it/. Delete it to remove everything.');
  assert.equal(f.querySelectorAll('code').length, 1);
});

function countIntervals(w) {
  const live = new Set();
  const real = { set: w.setInterval, clear: w.clearInterval };
  w.setInterval = (fn, ms, ...a) => { const id = real.set(fn, ms, ...a); if (ms === 3800) live.add(id); return id; };
  w.clearInterval = (id) => { live.delete(id); real.clear(id); };
  return { live, stop: () => live.forEach((id) => real.clear(id)) };
}

test('home leaves exactly one idle-shuffle interval across Home, game, Home', () => {
  const { w, home } = boot({ reduced: false });
  const t = countIntervals(w);
  w.OwnIt.register({ id: 'quiz', name: 'Quiz', keys: [], play() {} });
  home();
  assert.equal(t.live.size, 1);
  w.OwnIt.router.go({ game: 'quiz', roundId: 'x' });
  assert.equal(t.live.size, 0, 'left Home: interval stopped');
  home();
  assert.equal(t.live.size, 1);
  t.stop();
});

test('building state stops the idle shuffle', () => {
  const { w, stage, home } = boot({ reduced: false });
  const t = countIntervals(w);
  w.OwnIt.link.mode = 'live';
  w.OwnIt.link.send = () => Promise.resolve(true);
  w.OwnIt.link.onData = () => () => {};
  home();
  Array.from(stage.querySelectorAll('.tile-game')).find((x) => x.getAttribute('data-game') === 'quiz').click();
  go(w);
  assert.equal(t.live.size, 0);
  w.OwnIt.stopBuilding();
  t.stop();
});

test('offline note lives in the header and follows link mode', () => {
  const { w, stage, home } = boot();
  let modeCb = null;
  w.OwnIt.link.onMode = (cb) => { modeCb = cb; return () => {}; };
  home();
  const note = stage.querySelector('.offline-note');
  assert.ok(note && note.parentNode.classList.contains('header'), 'note is in the header');
  assert.equal(note.hasAttribute('hidden'), false);
  assert.match(note.textContent, /Offline mode/);
  w.OwnIt.link.mode = 'live';
  modeCb('live');
  assert.equal(note.hasAttribute('hidden'), true);
  w.OwnIt.link.mode = 'file';
  modeCb('file');
  assert.equal(note.hasAttribute('hidden'), false);
});

test('shell title reads Game name · Zone', () => {
  const { w, stage } = boot();
  w.OwnIt.register({ id: 'quiz', name: 'Quiz', keys: [], play(root, r, ctx) { w.OwnIt.shell(root, ctx, { zone: 'trips', total: 5 }); } });
  w.OwnIt.router.go({ game: 'quiz', roundId: 'x' });
  assert.equal(stage.querySelector('.shell-title').textContent, 'Quiz · Trips');
});

test('building fallback says Use copy and paste instead', () => {
  const { w, stage } = boot();
  w.OwnIt.link.onData = () => () => {};
  w.OwnIt.building(stage, { game: 'quiz', zone: 'trips', name: 'Quiz', onBack() {}, onCopy() {} });
  assert.equal(Array.from(stage.querySelectorAll('button')).filter((b) => b.textContent === 'Use copy and paste instead').length, 1);
  w.OwnIt.stopBuilding();
});

test('hint confirm counts hintsUsed and sends a hint event in live mode', () => {
  const { w, stage } = boot();
  const sent = [];
  w.OwnIt.link.mode = 'live';
  w.OwnIt.link.send = (type, payload) => { sent.push([type, JSON.parse(JSON.stringify(payload))]); return Promise.resolve(true); };
  let shell = null;
  w.OwnIt.register({ id: 'quiz', name: 'Quiz', keys: [], play(root, r, ctx) { shell = w.OwnIt.shell(root, ctx, { zone: 'trips', total: 5, hint: () => 'Think.' }); } });
  w.OwnIt.router.go({ game: 'quiz', roundId: 'trips-quiz-1' });
  Array.from(stage.querySelectorAll('button')).find((b) => b.textContent === 'Hint').click();
  Array.from(w.document.body.querySelectorAll('button')).find((b) => b.textContent === 'Show hint').click();
  assert.deepEqual(sent, [['hint', { round: 'trips-quiz-1' }]]);
  assert.equal(shell.hintsUsed(), 1);
  shell.result({ got: 1, total: 5, xp: 0, payload: { id: 'trips-quiz-1' } });
  assert.equal(sent[1][0], 'result');
  assert.equal(sent[1][1].hintsUsed, 1);
  w.OwnIt.link.stop(); // finish() now subscribes for the debrief; stop its polling
});

test('pick is not resent while that game and zone is building', () => {
  const { w, stage, home } = boot();
  const sent = [];
  w.OwnIt.link.mode = 'live';
  w.OwnIt.link.send = (t) => { sent.push(t); return Promise.resolve(true); };
  w.OwnIt.link.onData = () => () => {};
  home();
  w.OwnIt.home._pick('quiz', 'trips');
  go(w);
  w.OwnIt.home._pick('quiz', 'trips');
  go(w);
  assert.equal(sent.length, 1);
  w.OwnIt.stopBuilding();
});

test('re-render after first render flaps instantly (no cascade replay)', () => {
  const { w, stage, home } = boot({ reduced: false });
  home();
  home();
  const wrap = stage.querySelector('.home');
  assert.equal(wrap.classList.contains('enter'), false);
  const xp = stage.querySelector('.flap');
  assert.equal(xp.textContent, '00340', 'glyphs are final immediately');
  w.OwnIt.router.go({ game: 'quiz', roundId: 'x' }); // leaving Home stops its timers
});

test('result card links refs through vscode only when safe', () => {
  const { w } = boot();
  w.OWNIT_ROOT = 'C:/proj dir';
  const ctx = { router: { go() {} }, roundId: 'r' };
  w.OwnIt.resultCard(ctx, { got: 0, total: 1, xp: 0, missed: [
    { id: 'a', text: 'A', ref: 'server/x.ts:42' }, { id: 'b', text: 'B', ref: '../../etc/passwd:1' }, { id: 'c', text: 'C', ref: 'javascript:alert(1)' }] });
  const links = w.document.body.querySelectorAll('a');
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute('href'), 'vscode://file/C:/proj%20dir/server/x.ts:42');
  assert.equal(w.document.body.querySelectorAll('code').length, 3); // one inside the link, two plain
});

test('result card plays one sound on a clear (banner flap is silent)', () => {
  const { w } = boot({ reduced: false });
  const played = [];
  w.OwnIt.sound = (n) => played.push(n);
  w.OwnIt.resultCard({ router: { go() {} } }, { got: 1, total: 1, xp: 0, banner: 'RUNG CLEARED' });
  return new Promise((r) => setTimeout(r, 600)).then(() => {
    assert.deepEqual(played, ['levelup']);
    w.OwnIt.flap.length; // keep tiles quiet after test
  });
});

test('logo parser rejects unsafe paint and numeric values', () => {
  const { w } = boot();
  const svg = w.OwnIt.parseSvg('<svg viewBox="0 0 24 24"><path d="M0 0" stroke="url(javascript:x)" fill="red"/><path d="M1 1" stroke="#E8C26A" fill="none"/><circle cx="1" cy="onload" r="3"/></svg>');
  const [a, b, c] = svg.querySelectorAll('path, circle');
  assert.equal(a.hasAttribute('stroke'), false);
  assert.equal(a.hasAttribute('fill'), false);
  assert.equal(b.getAttribute('stroke'), '#E8C26A');
  assert.equal(c.hasAttribute('cy'), false);
});
