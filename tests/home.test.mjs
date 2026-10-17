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

function boot({ built = BUILT, progress = PROGRESS, recs, rounds } = {}) {
  const env = createEnv({ reduced: true });
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

test('home renders 18 library tiles, 6 enabled', () => {
  const { stage, home } = boot();
  home();
  const tiles = stage.querySelectorAll('.tile-game');
  assert.equal(tiles.length, 18);
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
  const rows = stage.querySelectorAll('.board-row').filter((r) => r.hasAttribute('data-zone'));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].querySelectorAll('.rung-cell').length, 5);
  assert.equal(rows[0].querySelectorAll('.rung-cell').filter((c) => c.classList.contains('c')).length, 1);
  assert.equal(rows[1].querySelectorAll('.flap').filter((f) => f.getAttribute('aria-label') === 'ON TIME').length, 1);
});

test('pick in file mode copies command', async () => {
  const { w, stage, home } = boot();
  let copied = null;
  w.navigator.clipboard.writeText = async (t) => { copied = t; };
  home();
  stage.querySelectorAll('.tile-game').find((t) => t.getAttribute('data-game') === 'quiz').click();
  assert.equal(copied, 'play quiz trips');
  await new Promise((r) => setTimeout(r, 0));
});

test('pick in live mode sends the event and shows the building state', () => {
  const { w, stage, home } = boot();
  const sent = [];
  w.OwnIt.link.mode = 'live';
  w.OwnIt.link.onData = () => () => {}; // no polling in this test
  w.OwnIt.link.send = (type, payload) => { sent.push([type, payload]); return Promise.resolve(true); };
  home();
  stage.querySelectorAll('.tile-game').find((t) => t.getAttribute('data-game') === 'quiz').click();
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [['pick', { game: 'quiz', zone: 'trips', mode: 'practice' }]]);
  assert.equal(stage.querySelectorAll('.building').length, 1);
  w.OwnIt.stopBuilding();
});

test('pick with a ready round opens the game', () => {
  const { w, home } = boot({ rounds: { 'trips-quiz-1': { q: 1 } } });
  let played = null;
  w.OwnIt.register({ id: 'quiz', name: 'Quiz', keys: [], play(root, round) { played = round; } });
  home();
  w.OwnIt.home._pick('quiz', 'trips');
  assert.equal(played.q, 1);
});

test('logo parser keeps safe shapes only', () => {
  const { w } = boot();
  const svg = w.OwnIt.parseSvg('<svg viewBox="0 0 24 24"><path d="M0 0" onclick="x()"/><script>bad</script><g><circle cx="1" cy="2" r="3"/></g></svg>');
  const kids = svg.querySelectorAll('path, circle, script, g');
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
