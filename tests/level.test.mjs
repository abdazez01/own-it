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

test('level is a live-link event and the CLI command list', () => {
  const src = readFileSync(join(SKILL_DIR, 'scripts', 'lib', 'cmd-serve.mjs'), 'utf8');
  assert.match(src.match(/EVENT_TYPES = \[[^\]]*\]/)[0], /'level'/);
  assert.match(readFileSync(join(SKILL_DIR, 'scripts', 'own-it.mjs'), 'utf8'), /'level'/);
  assert.ok(listGames().length > 0);
});

const FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js', 'home.js'];
function boot(settings) {
  const env = createEnv({ reduced: true });
  env.load(...FILES);
  const w = env.window;
  w.OWNIT_GAMES = listGames();
  w.OWNIT_PROGRESS = { xp: 0, zones: {}, settings };
  const stage = env.document.createElement('div');
  stage.setAttribute('id', 'stage');
  env.document.body.appendChild(stage);
  return { w, stage };
}

test('home shows a 5-way level switch at the stored level and sends a level event', () => {
  const { w, stage } = boot({ level: 'hard' });
  const sent = [];
  w.OwnIt.link.mode = 'live';
  w.OwnIt.link.send = (type, payload) => { sent.push([type, JSON.parse(JSON.stringify(payload))]); return Promise.resolve(true); };
  w.OwnIt.router.go('home');
  const bar = stage.querySelector('.level-bar');
  const btns = Array.from(bar.querySelectorAll('button'));
  assert.deepEqual(btns.map((b) => b.textContent), ['Easy', 'Medium', 'Hard', 'Impossible', 'Custom']);
  assert.equal(btns.find((b) => b.getAttribute('aria-checked') === 'true').textContent, 'Hard');
  btns[3].click();
  assert.deepEqual(sent, [['level', { level: 'impossible' }]]);
  btns[4].click();
  assert.deepEqual(sent[1], ['level', { level: 'custom' }]);
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
