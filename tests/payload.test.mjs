import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEnv } from './fake-dom.mjs';
import { run as collect } from '../own-it/scripts/lib/cmd-collect.mjs';
import { writeJson } from '../own-it/scripts/lib/json.mjs';
import { tmpProject, ctx as hctx } from './helpers.mjs';

const require = createRequire(import.meta.url);
const core = require('../own-it/assets/core.js');
const ASSETS = new URL('../own-it/assets/', import.meta.url);
const FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js', 'gamekit.js'];

// Plays the real quiz to the end with the real engine code and returns the payload the page would send.
function realQuizPayload() {
  const env = createEnv({ reduced: true });
  env.load(...FILES);
  const w = env.window;
  w.TextDecoder = TextDecoder;
  vm.runInContext(readFileSync(new URL('core.js', ASSETS), 'utf8'), env.ctx, { filename: 'core.js' });
  w.OwnIt.audio = { play() {} };
  w.OwnIt.juice.shake = () => {};
  w.OwnIt.juice.confetti = () => {};
  vm.runInContext(readFileSync(new URL('games/quiz.js', ASSETS), 'utf8'), env.ctx, { filename: 'quiz.js' });
  const root = env.document.createElement('div');
  env.document.body.appendChild(root);
  const finished = [];
  const ctx = { game: 'quiz', roundId: 'trips-quiz-1', root, router: { go() {} }, toast() {},
    keys: { on: (k, f) => w.OwnIt.keys.on(k, f, 'quiz') }, finish: (p) => finished.push(p) };
  w.OwnIt.keys.setScope('quiz');
  const round = { zone: 'trips', mode: 'practice', questions: [0, 1].map((i) => ({ q: `Q${i}?`,
    options: [0, 1, 2, 3].map((j) => ({ text: `opt ${i} ${j}`, why: core.encode('because') })), answer: core.encode(1) })) };
  const cleanup = w.OwnIt.games.get('quiz').play(root, round, ctx);
  const key = (k) => env.document.dispatchEvent(env.event('keydown', { key: k }));
  for (let i = 0; i < 2; i++) { key('2'); key('Enter'); }
  cleanup();
  return finished[0];
}

test('the real page payload passes collect validation (inbox result)', async () => {
  const payload = realQuizPayload();
  assert.ok(payload, 'payload sent');
  assert.equal(JSON.stringify(payload.text), '{}');
  assert.equal(payload.hintsUsed, 0);
  const root = tmpProject({});
  writeJson(join(root, '.own-it', 'progress.json'), { version: 1, settings: { downloadDir: null }, zones: {}, tokens: [] });
  writeJson(join(root, '.own-it', 'session.json'), { session: '2026-10-13T16:00:00.000Z', mode: 'practice', missions: {},
    rounds: { 'trips-quiz-1': { game: 'quiz', zone: 'trips', rung: 'map', mode: 'practice', cardIds: [] } } });
  mkdirSync(join(root, '.own-it', 'inbox'), { recursive: true });
  writeFileSync(join(root, '.own-it', 'inbox', '1-result.json'), JSON.stringify({ type: 'result', ...payload, submittedAt: '2026-10-13T16:05:00.000Z' }));
  const out = await collect({ _: ['trips-quiz-1'], flags: {} }, hctx(root, { env: { OWNIT_DOWNLOADS: join(root, 'nodl') } }));
  assert.equal(out.id, 'trips-quiz-1');
});

test('collect names the invalid field when an inbox result fails validation', async () => {
  const root = tmpProject({});
  writeJson(join(root, '.own-it', 'progress.json'), { version: 1, settings: { downloadDir: null }, zones: {}, tokens: [] });
  writeJson(join(root, '.own-it', 'session.json'), { session: '2026-10-13T16:00:00.000Z', mode: 'practice', missions: {},
    rounds: { 'trips-quiz-1': { game: 'quiz', zone: 'trips', rung: 'map', mode: 'practice', cardIds: [] } } });
  mkdirSync(join(root, '.own-it', 'inbox'), { recursive: true });
  writeFileSync(join(root, '.own-it', 'inbox', '1-result.json'), JSON.stringify({ type: 'result', id: 'trips-quiz-1', submittedAt: '2026-10-13T16:05:00.000Z', got: 1, of: 2, missed: [], hintsUsed: 0 }));
  await assert.rejects(collect({ _: ['trips-quiz-1'], flags: {} }, hctx(root, { env: { OWNIT_DOWNLOADS: join(root, 'nodl') } })), /invalid answer: .*text/);
});
