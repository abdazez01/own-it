import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { writeFileSync, readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from '../own-it/scripts/lib/cmd-serve.mjs';
import { run as wait } from '../own-it/scripts/lib/cmd-wait.mjs';
import { run as stop } from '../own-it/scripts/lib/cmd-stop.mjs';
import { run as collect } from '../own-it/scripts/lib/cmd-collect.mjs';
import { writeJson } from '../own-it/scripts/lib/json.mjs';
import { tmpProject, ctx } from './helpers.mjs';

function setup() {
  const root = tmpProject({});
  const dir = join(root, '.own-it');
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(join(dir, 'game.html'), '<h1>hi</h1>');
  writeFileSync(join(dir, 'recs.js'), 'window.R=1;');
  writeFileSync(join(dir, 'data', 'trips.js'), 'window.T=1;');
  writeFileSync(join(root, 'secret.txt'), 'nope');
  return { root, c: ctx(root, { env: {} }) };
}

function req(s, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((ok, fail) => {
    const r = http.request({ host: '127.0.0.1', port: s.port, method, path, headers: { ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => ok({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', (e) => (e.code === 'EPIPE' || e.code === 'ECONNRESET' ? ok({ status: 'reset' }) : fail(e)));
    if (body !== undefined) r.write(body);
    r.end();
  });
}

const post = (s, body, { t = s.token, headers = {} } = {}) =>
  req(s, { method: 'POST', path: `/event?t=${t}`, headers: { 'Content-Type': 'application/json', ...headers }, body });

async function withServer(fn) {
  const { root, c } = setup();
  const s = await startServer(c, { port: 0 });
  try { await fn(s, root, c); } finally { await s.close(); }
}

test('rejects POST without token', () => withServer(async (s, root) => {
  assert.equal((await req(s, { method: 'POST', path: '/event', body: '{"type":"pick"}' })).status, 403);
  assert.equal((await post(s, '{"type":"pick"}', { t: 'bad' })).status, 403);
  assert.equal(existsSync(join(root, '.own-it', 'inbox')), false);
}));

test('rejects foreign Origin', () => withServer(async (s) => {
  assert.equal((await post(s, '{"type":"pick"}', { headers: { Origin: 'http://evil.example' } })).status, 403);
  assert.equal((await post(s, '{"type":"pick"}', { headers: { Origin: `http://127.0.0.1:${s.port}` } })).status, 204);
}));

test('rejects 300KB body', () => withServer(async (s, root) => {
  const big = JSON.stringify({ type: 'ask', text: 'x'.repeat(300 * 1024) });
  const r = await post(s, big);
  assert.ok(r.status === 413 || r.status === 'reset', `got ${r.status}`);
  assert.equal(existsSync(join(root, '.own-it', 'inbox')), false);
}));

test('rejects non-JSON and unknown type', () => withServer(async (s) => {
  assert.equal((await post(s, 'nope')).status, 400);
  assert.equal((await post(s, '{"type":"zap"}')).status, 400);
}));

test('blocks ../ path and hidden files', () => withServer(async (s) => {
  assert.equal((await req(s, { path: '/../secret.txt' })).status, 404);
  assert.equal((await req(s, { path: '/%2e%2e/secret.txt' })).status, 404);
  assert.equal((await req(s, { path: '/..%5csecret.txt' })).status, 404);
  assert.equal((await req(s, { path: '/serve.json' })).status, 404);
  assert.equal((await req(s, { path: '/nonexistent.js' })).status, 404);
}));

test('rejects foreign Host header', () => withServer(async (s) => {
  assert.equal((await req(s, { path: '/game.html', headers: { Host: 'evil.example' } })).status, 403);
}));

test('serves game.html', () => withServer(async (s) => {
  const r = await req(s, { path: '/game.html' });
  assert.equal(r.status, 200);
  assert.equal(r.text, '<h1>hi</h1>');
  assert.equal((await req(s, { path: '/' })).text, '<h1>hi</h1>');
}));

test('state lists versions', () => withServer(async (s) => {
  assert.equal((await req(s, { path: '/state' })).status, 403);
  const r = await req(s, { path: `/state?t=${s.token}` });
  assert.equal(r.status, 200);
  const v = JSON.parse(r.text).versions;
  assert.deepEqual(Object.keys(v).sort(), ['data/trips.js', 'recs.js']);
  assert.equal(typeof v['recs.js'], 'number');
}));

test('event lands in inbox and wait prints it once', () => withServer(async (s, root, c) => {
  assert.equal((await post(s, '{"type":"pick","zone":"trips"}')).status, 204);
  const files = readdirSync(join(root, '.own-it', 'inbox'));
  assert.equal(files.length, 1);
  assert.match(files[0], /^\d+-pick\.json$/);
  const out = await wait({ _: [], flags: { timeout: '2' } }, c);
  assert.deepEqual(out, { type: 'pick', zone: 'trips', file: files[0] });
  assert.deepEqual(await wait({ _: [], flags: { timeout: '0' } }, c), { idle: true });
}));

test('wait idle on timeout 1s', async () => {
  const { c } = setup();
  const t = Date.now();
  assert.deepEqual(await wait({ _: [], flags: { timeout: '1' } }, c), { idle: true });
  assert.ok(Date.now() - t >= 900);
});

test('stop is idempotent and removes serve.json', async () => {
  const { root, c } = setup();
  const s = await startServer(c, { port: 0 });
  const file = join(root, '.own-it', 'serve.json');
  const info = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(info).sort(), ['pid', 'port', 'startedAt', 'token']);
  assert.match(info.token, /^[0-9a-f]{32}$/);
  await s.close();
  assert.equal(existsSync(file), false);
  assert.deepEqual(await stop({ _: [], flags: {} }, c), { stopped: true });
  assert.deepEqual(await stop({ _: [], flags: {} }, c), { stopped: true });
});

test('collect prefers inbox result', async () => {
  const { root, c } = setup();
  writeJson(join(root, '.own-it', 'session.json'), { session: '2026-10-13T16:00:00.000Z', mode: 'practice',
    missions: { 'trips-map-1': { zone: 'trips', rung: 'map', board: 'component', cardIds: [] } } });
  const inbox = join(root, '.own-it', 'inbox');
  mkdirSync(inbox, { recursive: true });
  const ans = (got, ts) => ({ type: 'result', id: 'trips-map-1', submittedAt: '2026-10-13T16:05:00.000Z', got, of: 2, missed: [], text: {}, hintsUsed: 0, ...ts });
  writeFileSync(join(inbox, '1000-result.json'), JSON.stringify(ans(0)));
  writeFileSync(join(inbox, '2000-result.json'), JSON.stringify(ans(2)));
  const out = await collect({ _: ['trips-map-1'], flags: {} }, c);
  assert.deepEqual(out, { id: 'trips-map-1', got: 2, of: 2, missed: [], text: {} });
  assert.ok(existsSync(join(root, '.own-it', 'answers', 'trips-map-1.json')));
});
