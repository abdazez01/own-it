import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync, utimesSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run as collect } from '../own-it/scripts/lib/cmd-collect.mjs';
import { writeJson } from '../own-it/scripts/lib/json.mjs';
import { tmpProject, ctx, tmpDir } from './helpers.mjs';

function setup() {
  const root = tmpProject({});
  const dl = tmpDir('ownit-dl-');
  writeJson(join(root, '.own-it', 'progress.json'), { version: 1, settings: { downloadDir: null }, zones: {}, tokens: [] });
  writeJson(join(root, '.own-it', 'session.json'), { session: '2026-10-13T16:00:00.000Z', mode: 'practice',
    missions: { 'trips-map-1': { zone: 'trips', rung: 'map', board: 'component', cardIds: [] } } });
  return { root, dl, c: ctx(root, { env: { OWNIT_DOWNLOADS: dl } }) };
}
const ans = (o = {}) => ({ id: 'trips-map-1', submittedAt: '2026-10-13T16:05:00.000Z', got: 1, of: 2, missed: ['e2'], text: {}, hintsUsed: 0, challenges: [], ...o });

test('picks newest renamed file, moves it, prints compact summary without empty wrong', async () => {
  const { root, dl, c } = setup();
  writeFileSync(join(dl, 'own-it-trips-map-1.json'), JSON.stringify(ans({ got: 0 })));
  writeFileSync(join(dl, 'own-it-trips-map-1 (1).json'), JSON.stringify(ans({ got: 2, missed: [] , wrong: [] })));
  utimesSync(join(dl, 'own-it-trips-map-1.json'), new Date(1000), new Date(1000));
  const out = await collect({ _: ['trips-map-1'], flags: {} }, c);
  assert.deepEqual(out, { id: 'trips-map-1', got: 2, of: 2, missed: [], text: {} });
  assert.equal(existsSync(join(dl, 'own-it-trips-map-1 (1).json')), false);
  assert.ok(existsSync(join(root, '.own-it', 'answers', 'trips-map-1.json')));
});

test('keeps wrong when non-empty', async () => {
  const { dl, c } = setup();
  writeFileSync(join(dl, 'own-it-trips-map-1.json'), JSON.stringify(ans({ wrong: [['c', 'b']] })));
  assert.deepEqual((await collect({ _: ['trips-map-1'], flags: {} }, c)).wrong, [['c', 'b']]);
});

test('rejects answers older than the session', async () => {
  const { dl, c } = setup();
  writeFileSync(join(dl, 'own-it-trips-map-1.json'), JSON.stringify(ans({ submittedAt: '2026-10-12T10:00:00.000Z' })));
  await assert.rejects(collect({ _: ['trips-map-1'], flags: {} }, c), /older than this session/);
});

test('rejects mismatched id, unknown mission, missing file', async () => {
  const { dl, c } = setup();
  writeFileSync(join(dl, 'own-it-trips-map-1.json'), JSON.stringify(ans({ id: 'other-1' })));
  await assert.rejects(collect({ _: ['trips-map-1'], flags: {} }, c), /answer file is for "other-1", expected "trips-map-1"/);
  await assert.rejects(collect({ _: ['nope-1'], flags: {} }, c), /unknown mission "nope-1"/);
  const fresh = setup();
  await assert.rejects(collect({ _: ['trips-map-1'], flags: {} }, fresh.c), /no answer file for "trips-map-1"/);
});

test('accepts OWNIT: clipboard payload', async () => {
  const { root, c } = setup();
  const b64 = Buffer.from(JSON.stringify(ans())).toString('base64');
  const out = await collect({ _: ['OWNIT:' + b64], flags: {} }, c);
  assert.equal(out.got, 1);
  assert.ok(existsSync(join(root, '.own-it', 'answers', 'trips-map-1.json')));
});
