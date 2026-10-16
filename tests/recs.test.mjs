import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run as buildRecs } from '../own-it/scripts/lib/cmd-build-recs.mjs';
import { listGames } from '../own-it/scripts/lib/games.mjs';
import { saveModel } from '../own-it/scripts/lib/model.mjs';
import { tmpProject, ctx } from './helpers.mjs';

const rec = (o = {}) => ({ game: 'quiz', zone: 'trips', reason: 'Your trip flow has several roles.', ...o });
const three = () => [rec(), rec({ game: 'pager' }), rec({ game: 'quests' })];

function setup(recs) {
  const root = tmpProject({});
  saveModel(root, { version: 1, zones: { trips: { name: 'Trips', paths: ['api'], items: [] } } });
  writeFileSync(join(root, 'recs.json'), JSON.stringify({ recs }));
  return root;
}

test('listGames returns 18 with unique ids', () => {
  const games = listGames();
  assert.equal(games.length, 18);
  assert.equal(new Set(games.map((g) => g.id)).size, 18);
});

test('recs rejects unknown game', async () => {
  const root = setup([rec({ game: 'nope' }), rec(), rec()]);
  await assert.rejects(buildRecs({ _: ['recs.json'], flags: {} }, ctx(root)), /unknown game "nope"/);
});

test('recs rejects unknown zone', async () => {
  const root = setup([rec({ zone: 'ghost' }), rec(), rec()]);
  await assert.rejects(buildRecs({ _: ['recs.json'], flags: {} }, ctx(root)), /unknown zone "ghost"/);
});

test('recs writes OWNIT_RECS', async () => {
  const root = setup(three());
  const out = await buildRecs({ _: ['recs.json'], flags: {} }, ctx(root));
  assert.deepEqual(out, { count: 3 });
  const js = readFileSync(join(root, '.own-it', 'recs.js'), 'utf8');
  assert.match(js, /^window\.OWNIT_RECS = /);
  const data = JSON.parse(js.slice('window.OWNIT_RECS = '.length).replace(/;\n$/, ''));
  assert.equal(data.length, 3);
  assert.deepEqual(data[1], { game: 'pager', zone: 'trips', reason: 'Your trip flow has several roles.' });
});

test('recs rejects >5', async () => {
  const six = [...three(), rec({ game: 'escape-room' }), rec({ game: 'teach-back' }), rec({ game: 'what-if' })];
  const root = setup(six);
  await assert.rejects(buildRecs({ _: ['recs.json'], flags: {} }, ctx(root)), /invalid recs/);
});
