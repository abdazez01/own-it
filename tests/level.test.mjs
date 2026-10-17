import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEnv } from './fake-dom.mjs';
import { run as level } from '../own-it/scripts/lib/cmd-level.mjs';
import { run as buildRecs, orderRecs } from '../own-it/scripts/lib/cmd-build-recs.mjs';
import { saveModel } from '../own-it/scripts/lib/model.mjs';
import { listGames } from '../own-it/scripts/lib/games.mjs';
import { SKILL_DIR } from '../own-it/scripts/lib/paths.mjs';
import { tmpProject, ctx } from './helpers.mjs';

const lv = (root, ...a) => level({ _: a.filter((x) => typeof x === 'string'), flags: a.find((x) => typeof x === 'object') || {} }, ctx(root));
const settings = (root) => JSON.parse(readFileSync(join(root, '.own-it', 'progress.json'), 'utf8')).settings;

test('level validates the value', async () => {
  const root = tmpProject({});
  await assert.rejects(lv(root), /usage: level/);
  await assert.rejects(lv(root, 'brutal'), /usage: level/);
  await assert.rejects(lv(root, 'easy', { about: 'x' }), /only for custom/);
});

test('level stores the level in progress settings and the page file', async () => {
  const root = tmpProject({});
  assert.deepEqual(await lv(root, 'hard'), { level: 'hard' });
  assert.equal(settings(root).level, 'hard');
  assert.match(readFileSync(join(root, '.own-it', 'progress.js'), 'utf8'), /"level": ?"hard"/);
  await lv(root, 'impossible');
  assert.equal(settings(root).level, 'impossible');
});

test('custom needs --about (1..300, trimmed) and a valid --base', async () => {
  const root = tmpProject({});
  await assert.rejects(lv(root, 'custom', { base: 'easy' }), /--about/);
  await assert.rejects(lv(root, 'custom', { about: '   ', base: 'easy' }), /--about/);
  await assert.rejects(lv(root, 'custom', { about: 'x'.repeat(301), base: 'easy' }), /--about/);
  await assert.rejects(lv(root, 'custom', { about: 'I know React' }), /--base/);
  await assert.rejects(lv(root, 'custom', { about: 'I know React', base: 'custom' }), /--base/);
  const out = await lv(root, 'custom', { about: '  I know React but not this backend  ', base: 'medium' });
  assert.deepEqual(out, { level: 'custom', base: 'medium', about: 'I know React but not this backend' });
  assert.equal(settings(root).levelAbout, 'I know React but not this backend');
  assert.equal(settings(root).levelBase, 'medium');
  await lv(root, 'hard');
  assert.equal(settings(root).levelAbout, undefined);
  assert.equal(settings(root).levelBase, undefined);
});

const rec = (game) => ({ game, zone: 'trips', reason: 'Because.' });

test('orderRecs orders by level and is deterministic', () => {
  const all = ['quiz', 'screen-tour', 'quests', 'pager', 'boss-battle'].map(rec);
  const ids = (l) => orderRecs(all, l).map((r) => r.game);
  assert.deepEqual(ids('easy'), ['screen-tour', 'quiz', 'quests', 'pager']);
  assert.deepEqual(ids('medium'), ['screen-tour', 'quests', 'quiz', 'pager', 'boss-battle']);
  assert.deepEqual(ids('hard'), ['quests', 'pager', 'screen-tour', 'boss-battle', 'quiz']);
  assert.deepEqual(ids('impossible'), ['pager', 'boss-battle', 'quests', 'screen-tour']);
  assert.deepEqual(ids('impossible'), ids('impossible'));
});

test('build-recs uses the stored level, custom uses its base, unset keeps order', async () => {
  const root = tmpProject({});
  saveModel(root, { version: 1, zones: { trips: { name: 'Trips', paths: ['api'], items: [] } } });
  writeFileSync(join(root, 'recs.json'), JSON.stringify({ recs: ['quiz', 'pager', 'quests'].map(rec) }));
  const games = () => JSON.parse(readFileSync(join(root, '.own-it', 'recs.js'), 'utf8').slice('window.OWNIT_RECS = '.length).replace(/;\n$/, '')).map((r) => r.game);
  await buildRecs({ _: ['recs.json'], flags: {} }, ctx(root));
  assert.deepEqual(games(), ['quiz', 'pager', 'quests']);
  await lv(root, 'impossible');
  await buildRecs({ _: ['recs.json'], flags: {} }, ctx(root));
  assert.deepEqual(games(), ['pager', 'quests', 'quiz']);
  await lv(root, 'custom', { about: 'I know the whole app', base: 'easy' });
  await buildRecs({ _: ['recs.json'], flags: {} }, ctx(root));
  assert.deepEqual(games(), ['quiz', 'quests', 'pager']);
});

test('level is not a live-link event; pick validates it; CLI lists level', () => {
  const src = readFileSync(join(SKILL_DIR, 'scripts', 'lib', 'cmd-serve.mjs'), 'utf8');
  assert.doesNotMatch(src.match(/EVENT_TYPES = \[[^\]]*\]/)[0], /'level'/);
  assert.match(src, /validLevel/);
  assert.match(readFileSync(join(SKILL_DIR, 'scripts', 'own-it.mjs'), 'utf8'), /'level'/);
});

const FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js', 'home.js'];
function boot(settings) {
  const env = createEnv({ reduced: true });
  env.load(...FILES);
  const w = env.window;
  w.OWNIT_GAMES = listGames();
  w.OWNIT_PROGRESS = { xp: 0, zones: { trips: { name: 'Trips', rungs: { words: 'open', map: 'locked', trace: 'locked', break: 'locked', boss: 'locked' }, claimed: false, fogged: false, weakSpots: [] } }, settings };
  const stage = env.document.createElement('div');
  stage.setAttribute('id', 'stage');
  env.document.body.appendChild(stage);
  w.OwnIt.register({ id: 'quiz', name: 'Quiz', keys: [], play() {} });
  w.__env = env;
  return { w, stage };
}

const tile = (stage) => Array.from(stage.querySelectorAll('.tile-game')).find((t) => t.getAttribute('data-game') === 'quiz');
const dlg = (w) => w.document.body.querySelector('.level-picker');
const btn = (w, text) => Array.from(dlg(w).querySelectorAll('button')).find((b) => b.textContent === text);
function live(w) {
  const sent = [];
  w.OwnIt.link.mode = 'live';
  w.OwnIt.link.onData = () => () => {};
  w.OwnIt.link.send = (type, payload) => { sent.push([type, JSON.parse(JSON.stringify(payload))]); return Promise.resolve(true); };
  return sent;
}
const press = (w, el, k) => el.dispatchEvent(w.__env.event('keydown', { key: k }));

test('home has no level switch; clicking a tile opens the picker with 5 options', () => {
  const { w, stage } = boot({ level: 'hard' });
  w.OwnIt.router.go('home');
  assert.equal(stage.querySelector('.level-bar'), null);
  tile(stage).click();
  assert.ok(dlg(w), 'picker open');
  const opts = Array.from(dlg(w).querySelectorAll('.level-opt'));
  assert.deepEqual(opts.map((b) => b.querySelector('strong').textContent), ['Easy', 'Medium', 'Hard', 'Impossible', 'Other']);
  assert.equal(opts.find((b) => b.getAttribute('aria-checked') === 'true').getAttribute('data-id'), 'hard');
});

test('pick payload carries the level; hard defaults to exam', () => {
  const { w, stage } = boot({ level: 'hard' });
  const sent = live(w);
  w.OwnIt.router.go('home');
  tile(stage).click();
  btn(w, 'Start').click();
  assert.deepEqual(sent, [['pick', { game: 'quiz', zone: 'trips', mode: 'exam', level: 'hard' }]]);
  w.OwnIt.stopBuilding();
});

test('Other requires text, then sends about', () => {
  const { w, stage } = boot({});
  const sent = live(w);
  w.OwnIt.router.go('home');
  tile(stage).click();
  Array.from(dlg(w).querySelectorAll('.level-opt')).find((b) => b.getAttribute('data-id') === 'custom').click();
  btn(w, 'Start').click();
  assert.ok(dlg(w), 'still open without text');
  assert.equal(sent.length, 0);
  dlg(w).querySelector('textarea').value = '  I know React  ';
  btn(w, 'Start').click();
  assert.equal(dlg(w), null);
  assert.deepEqual(sent, [['pick', { game: 'quiz', zone: 'trips', mode: 'practice', level: 'custom', about: 'I know React' }]]);
  w.OwnIt.stopBuilding();
});

test('Esc cancels and Enter starts', () => {
  const { w, stage } = boot({});
  const sent = live(w);
  w.OwnIt.router.go('home');
  tile(stage).click();
  press(w, dlg(w), 'Escape');
  assert.equal(dlg(w), null);
  assert.equal(sent.length, 0);
  tile(stage).click();
  press(w, dlg(w).querySelector('.level-opt[aria-checked="true"]'), 'ArrowDown');
  assert.equal(dlg(w).querySelector('.level-opt[aria-checked="true"]').getAttribute('data-id'), 'hard');
  press(w, dlg(w).querySelector('.level-opt[aria-checked="true"]'), 'Enter');
  assert.equal(dlg(w), null);
  assert.equal(sent[0][1].level, 'hard');
  w.OwnIt.stopBuilding();
});

test('a round built at another level is not reused', () => {
  const { w, stage } = boot({ level: 'easy' });
  w.OWNIT_ROUNDS = { 'trips-quiz-1': { level: 'hard' }, 'trips-quiz-2': { level: 'easy' } };
  let played = null;
  w.OwnIt.register({ id: 'quiz', name: 'Quiz', keys: [], play(root, r) { played = r; } });
  w.OwnIt.router.go('home');
  tile(stage).click();
  btn(w, 'Start').click();
  assert.equal(played.level, 'easy');
});

test('level defaults to medium and drives hint cost', () => {
  const none = boot({});
  assert.equal(none.w.OwnIt.level(), 'medium');
  assert.equal(none.w.OwnIt.hintCost(), 15);
  const cost = (settings) => boot(settings).w.OwnIt.hintCost();
  assert.equal(cost({ level: 'easy' }), 0);
  assert.equal(cost({ level: 'hard' }), 30);
  assert.equal(cost({ level: 'custom', levelBase: 'hard' }), 30);
  assert.equal(boot({ level: 'impossible' }).w.OwnIt.level(), 'impossible');
});

test('impossible marks the boss rung open on Home', () => {
  const cells = (settings) => {
    const { w, stage } = boot(settings);
    w.OwnIt.router.go('home');
    return Array.from(stage.querySelectorAll('.rung-cell')).filter((c) => c.classList.contains('o')).length;
  };
  assert.equal(cells({ level: 'impossible' }), cells({ level: 'hard' }) + 1);
});
