import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEnv, ENGINE_DIR } from './fake-dom.mjs';

const ALL = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js'];
const CHARSET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-:.';

function boot(opts) {
  const env = createEnv(opts);
  env.load(...ALL);
  return env;
}

test('flapSteps ends at target and has 4+index steps', () => {
  const { OwnIt } = boot().window;
  for (const [ch, i] of [['A', 0], ['7', 3], ['/', 9], ['q', 2]]) {
    const steps = OwnIt.flapSteps(ch, i);
    assert.equal(steps.length, 4 + i);
    assert.equal(steps[steps.length - 1], ch.toUpperCase());
    assert.ok(steps.every((s) => CHARSET.includes(s)));
  }
});

test('flap renders aria-hidden tiles under an aria-label row (reduced motion)', () => {
  const env = boot({ reduced: true });
  const row = env.document.createElement('div');
  env.window.OwnIt.flap(row, 'a/b', {});
  assert.equal(row.getAttribute('aria-label'), 'a/b');
  assert.equal(row.children.length, 3);
  assert.ok(row.children.every((t) => t.getAttribute('aria-hidden') === 'true'));
  assert.equal(row.textContent, 'A/B');
  assert.ok(row.children[1].classList.contains('accent'));
});

test('register + router.go builds game root', () => {
  const env = boot();
  const { OwnIt } = env.window;
  const stage = env.document.createElement('div');
  stage.setAttribute('id', 'stage');
  env.document.body.appendChild(stage);
  let seen = null;
  OwnIt.register({ id: 'quiz', name: 'Quiz', minutes: 5, keys: [], play(root, round, ctx) { seen = { root, round, ctx }; } });
  assert.ok(OwnIt.games.has('quiz'));
  env.window.OWNIT_ROUNDS = { 'trips-quiz-1': { q: 1 } };
  env.window.OWNIT_FEEDBACK = { 'trips-quiz-1': { note: 'n' } };
  assert.equal(OwnIt.router.go({ game: 'quiz', roundId: 'trips-quiz-1' }), true);
  assert.equal(OwnIt.router.current().game, 'quiz');
  assert.equal(stage.children.length, 1);
  assert.equal(stage.children[0].getAttribute('data-game'), 'quiz');
  assert.equal(seen.root, stage.children[0]);
  assert.equal(seen.round.q, 1);
  assert.equal(seen.ctx.feedback.note, 'n');
  assert.equal(OwnIt.feedback('nope'), null);
  OwnIt.router.go('home');
  assert.equal(OwnIt.router.current(), 'home');
  assert.equal(stage.children.length, 0);
  assert.equal(OwnIt.router.go({ game: 'nope', roundId: 'x' }), false);
});

test('toggle arrow keys change aria-checked', () => {
  const env = boot();
  const el = env.document.createElement('div');
  const changes = [];
  env.window.OwnIt.toggle(el, [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], 'a', (v) => changes.push(v));
  const radios = el.querySelectorAll('button');
  assert.equal(el.getAttribute('role'), 'radiogroup');
  assert.equal(radios[0].getAttribute('aria-checked'), 'true');
  radios[0].dispatchEvent(env.event('keydown', { key: 'ArrowRight' }));
  assert.equal(radios[1].getAttribute('aria-checked'), 'true');
  assert.equal(radios[0].getAttribute('aria-checked'), 'false');
  radios[1].dispatchEvent(env.event('keydown', { key: 'ArrowLeft' }));
  assert.equal(radios[0].getAttribute('aria-checked'), 'true');
  radios[2].click();
  assert.equal(radios[2].getAttribute('aria-checked'), 'true');
  assert.equal(changes.join(','), 'b,a,c');
});

test('router navigation clears key handlers and calls game cleanup', () => {
  const env = boot();
  const { OwnIt } = env.window;
  const hits = [];
  let cleaned = 0;
  OwnIt.register({ id: 'quiz', play(root, round, ctx) {
    ctx.keys.on('n', () => hits.push('n'));
    ctx.link.onData(() => {});
    return () => { cleaned++; };
  } });
  OwnIt.router.go({ game: 'quiz', roundId: 'trips-quiz-1' });
  env.document.dispatchEvent(env.event('keydown', { key: 'n', target: env.document.body }));
  assert.equal(hits.length, 1);
  assert.equal(OwnIt.link.subscriberCount(), 1);
  OwnIt.router.go('home');
  assert.equal(cleaned, 1);
  env.document.dispatchEvent(env.event('keydown', { key: 'n', target: env.document.body }));
  assert.equal(hits.length, 1);
  assert.equal(OwnIt.link.subscriberCount(), 0);
  OwnIt.link.stop();
});

test('router: a game that throws in play falls back home with a toast', () => {
  const env = boot();
  const { OwnIt } = env.window;
  env.window.console = { error() {} };
  OwnIt.register({ id: 'bad', play() { throw new Error('boom'); } });
  assert.equal(OwnIt.router.go({ game: 'bad', roundId: 'a-bad-1' }), false);
  assert.equal(OwnIt.router.current(), 'home');
  assert.ok(env.document.body.textContent.includes("can't be played"));
});

test('keys ignore typing in an input, honor aliases, and pause while help is open', () => {
  const env = boot();
  const { OwnIt } = env.window;
  const hits = [];
  OwnIt.keys.on('Esc', () => hits.push('esc'));
  OwnIt.keys.on('Space', () => hits.push('space'));
  OwnIt.keys.on('n', () => hits.push('n'));
  const input = env.document.createElement('input');
  env.document.body.appendChild(input);
  env.document.dispatchEvent(env.event('keydown', { key: 'n', target: input }));
  assert.equal(hits.length, 0);
  env.document.dispatchEvent(env.event('keydown', { key: ' ', target: env.document.body }));
  assert.equal(hits.join(), 'space');
  env.document.dispatchEvent(env.event('keydown', { key: 'n', target: env.document.body, defaultPrevented: true }));
  assert.equal(hits.length, 1);
  env.document.dispatchEvent(env.event('keydown', { key: '?', target: env.document.body }));
  env.document.dispatchEvent(env.event('keydown', { key: 'n', target: env.document.body }));
  assert.equal(hits.length, 1, 'game keys pause while help is open');
});

test('toggle adds no per-toggle window listeners; set() is silent', () => {
  const env = boot();
  const { OwnIt } = env.window;
  const sounds = [];
  OwnIt.audio = { play: (n) => sounds.push(n) };
  let adds = 0;
  env.window.addEventListener = () => { adds++; };
  const mk = () => OwnIt.toggle(env.document.createElement('div'), [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], 'a');
  const t = mk(); mk(); mk();
  assert.ok(adds <= 1, 'adds=' + adds);
  t.set('b');
  assert.equal(t.get(), 'b');
  assert.equal(sounds.length, 0);
});

test('link file mode: result downloads own-it-<id>.json and offers a copy', async () => {
  const env = boot({ search: '' });
  const { OwnIt } = env.window;
  const made = [];
  const orig = env.document.createElement;
  env.document.createElement = (t) => { const e = orig(t); if (t === 'a') made.push(e); return e; };
  let copied = null;
  env.window.navigator.clipboard.writeText = async (t) => { copied = t; };
  await OwnIt.link.send('result', { id: 'trips-quiz-1', got: 3 });
  assert.equal(made.length, 1);
  assert.equal(made[0].getAttribute('download'), 'own-it-trips-quiz-1.json');
  const btn = Array.from(env.document.body.querySelectorAll('button')).find((b) => b.textContent === 'Copy answer');
  assert.ok(btn);
  btn.click();
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(copied.startsWith('OWNIT:'));
  assert.equal(JSON.parse(Buffer.from(copied.slice(6), 'base64').toString()).got, 3);
});

test('link: failed live result POST falls back to the file download', async () => {
  const made = [];
  let post = false;
  const fetch = async (url, init) => {
    if (init && init.method === 'POST') { post = true; throw new Error('down'); }
    return { ok: true, json: async () => ({ versions: {} }) };
  };
  const env = boot({ search: '?t=k', fetch });
  const orig = env.document.createElement;
  env.document.createElement = (t) => { const e = orig(t); if (t === 'a') made.push(e); return e; };
  await env.window.OwnIt.link.ready;
  await env.window.OwnIt.link.send('result', { id: 'a-quiz-1' });
  assert.ok(post);
  assert.equal(made.length, 1);
});

test('link: lost dialog slows polling to 10 s and hides on recovery', async () => {
  let fail = false;
  const fetch = async () => {
    if (fail) throw new Error('down');
    return { ok: true, json: async () => ({ versions: {} }) };
  };
  const env = boot({ search: '?t=z', fetch });
  const { link } = env.window.OwnIt;
  await link.ready;
  assert.equal(link.nextDelay(), 2000);
  fail = true;
  for (let i = 0; i < 3; i++) await link.poll();
  assert.equal(link.lost, true);
  assert.equal(link.nextDelay(), 10000);
  const title = env.document.body.querySelector('h2');
  assert.equal(title.getAttribute('role'), null, 'role=img must not sit on the heading');
  fail = false;
  await link.poll();
  assert.equal(link.lost, false);
  assert.equal(link.nextDelay(), 2000);
  assert.ok(!env.document.body.textContent.includes("can't reach"));
});

test('link: a hung poll is aborted and counts as a failure; polls do not overlap', async () => {
  let calls = 0, sawSignal = false;
  const fetch = (url, init) => {
    calls++;
    if (calls === 1) return Promise.resolve({ ok: true, json: async () => ({ versions: {} }) });
    sawSignal = !!(init && init.signal);
    return new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('abort'))));
  };
  const env = boot({ search: '?t=h', fetch });
  const { link } = env.window.OwnIt;
  await link.ready;
  const p1 = link.poll(), p2 = link.poll();
  assert.equal(p1, p2);
  assert.equal(calls, 2);
  assert.ok(sawSignal);
  link.abortInflight();
  await p1;
  assert.equal(link.failures(), 1);
});

test('link: only safe script names are re-injected; unsubscribe works', async () => {
  let versions = { 'progress.js': 1 };
  const fetch = async () => ({ ok: true, json: async () => ({ versions }) });
  const env = boot({ search: '?t=s', fetch });
  const { link } = env.window.OwnIt;
  await link.ready;
  const off = link.onData(() => {});
  link.stop();
  versions = { 'progress.js': 2, '../evil.js': 1, 'a b.js': 1, 'data/x-quiz-1.js': 5 };
  await link.poll();
  const srcs = Array.from(env.document.head.querySelectorAll('script')).map((s) => s.getAttribute('src')).sort();
  assert.equal(srcs.join(), 'data/x-quiz-1.js?v=5,progress.js?v=2');
  off();
  assert.equal(link.subscriberCount(), 0);
});

test('link: initial probe retries before settling on file mode', async () => {
  let n = 0;
  const fetch = async () => { n++; if (n < 3) throw new Error('boot'); return { ok: true, json: async () => ({ versions: {} }) }; };
  const env = boot({ search: '?t=r', fetch });
  assert.equal(await env.window.OwnIt.link.ready, 'live');
  assert.equal(n, 3);
});

test('toast uses one persistent live region', () => {
  const env = boot();
  const { OwnIt } = env.window;
  OwnIt.toast('Copied');
  OwnIt.toast('Sound off');
  const regions = env.document.body.querySelectorAll('[aria-live]');
  assert.equal(regions.length, 1);
  assert.equal(regions[0].textContent, 'Sound off');
});

test('link file mode when no token', async () => {
  const env = boot({ search: '' });
  assert.equal(await env.window.OwnIt.link.ready, 'file');
  assert.equal(env.window.OwnIt.link.mode, 'file');
});

test('link send posts with token', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 204, json: async () => ({ versions: { 'progress.js': 1 } }) };
  };
  const env = boot({ search: '?t=abc123', fetch });
  const { link } = env.window.OwnIt;
  assert.equal(await link.ready, 'live');
  assert.equal(link.mode, 'live');
  assert.equal(calls[0].url, '/state?t=abc123');
  assert.equal(await link.send('pick', { game: 'quiz' }), true);
  const post = calls[1];
  assert.equal(post.url, '/event?t=abc123');
  assert.equal(post.init.method, 'POST');
  assert.deepEqual(JSON.parse(post.init.body), { type: 'pick', game: 'quiz' });
});

test('link shows link-lost after 3 failed polls and reinjects changed scripts', async () => {
  let version = 1, fail = false;
  const fetch = async () => {
    if (fail) throw new Error('down');
    return { ok: true, json: async () => ({ versions: { 'progress.js': version } }) };
  };
  const env = boot({ search: '?t=z', fetch });
  const { link } = env.window.OwnIt;
  await link.ready;
  version = 2;
  await link.poll();
  const s = env.document.head.querySelectorAll('script');
  assert.equal(s.length, 1);
  assert.equal(s[0].getAttribute('src'), 'progress.js?v=2');
  fail = true;
  await link.poll(); await link.poll();
  assert.equal(link.lost, false);
  await link.poll();
  assert.equal(link.lost, true);
  assert.ok(env.document.body.textContent.includes("can't reach Claude"));
});

test('keys: game scope wins and help overlay opens on ?', () => {
  const env = boot();
  const { OwnIt } = env.window;
  OwnIt.register({ id: 'quiz', play() {}, keys: [{ key: 'N', action: 'Next' }] });
  const hits = [];
  OwnIt.keys.on('n', () => hits.push('game'), 'quiz');
  OwnIt.keys.on('n', () => hits.push('global'), 'global');
  OwnIt.keys.setScope('quiz');
  env.document.dispatchEvent(env.event('keydown', { key: 'N', target: env.document.body }));
  assert.deepEqual([...hits], ['game']);
  env.document.dispatchEvent(env.event('keydown', { key: '?', target: env.document.body }));
  assert.ok(env.document.body.textContent.includes('Keyboard shortcuts'));
  assert.ok(env.document.body.textContent.includes('Next'));
  env.document.dispatchEvent(env.event('keydown', { key: 'Escape', target: env.document.body }));
  assert.ok(!env.document.body.textContent.includes('Keyboard shortcuts'));
});

test('juice: global pointerdown ripples buttons and plays press sound', () => {
  const env = boot();
  const { OwnIt } = env.window;
  const sounds = [];
  OwnIt.audio = { play: (n) => sounds.push(n) };
  const b = env.document.createElement('button');
  env.document.body.appendChild(b);
  b.dispatchEvent(env.event('pointerdown', { clientX: 10, clientY: 10 }));
  assert.equal(b.querySelectorAll('.ripple').length, 1);
  assert.deepEqual([...sounds], ['press']);
});

test('icons.svg returns an svg for every named icon', () => {
  const { OwnIt } = boot().window;
  for (const n of ['sound', 'music', 'help', 'close', 'check', 'arrow', 'lock', 'flag', 'timer']) {
    const svg = OwnIt.icons.svg(n);
    assert.equal(svg.tagName.toLowerCase(), 'svg');
    assert.ok(svg.children.length > 0, n);
  }
});

test('no innerHTML in engine sources', () => {
  const files = readdirSync(ENGINE_DIR).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= ALL.length);
  for (const f of files) {
    const src = readFileSync(join(ENGINE_DIR, f), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src), f);
  }
});

test('link: files written after the page loaded are injected on the first poll', async () => {
  const fresh = Date.now() + 60000;
  const fetch = async () => ({ ok: true, json: async () => ({ versions: { 'rounds.js': fresh, 'feedback.js': 5, 'recs.js': 5 } }) });
  const env = boot({ search: '?t=f', fetch });
  await env.window.OwnIt.link.ready;
  const srcs = Array.from(env.document.head.querySelectorAll('script')).map((s) => s.getAttribute('src')).sort();
  assert.deepEqual(srcs, [`rounds.js?v=${fresh}`]);
});

test('router keeps the open game in the URL hash and restore() reopens it after a reload', () => {
  const env = boot();
  const { OwnIt } = env.window;
  const stage = env.document.createElement('div');
  stage.setAttribute('id', 'stage');
  env.document.body.appendChild(stage);
  const urls = [];
  env.window.history = { replaceState: (_s, _t, url) => urls.push(url) };
  env.window.location.pathname = '/game.html';
  OwnIt.register({ id: 'quiz', name: 'Quiz', minutes: 5, keys: [], play() {} });
  env.window.OWNIT_ROUNDS = { 'trips-quiz-1': { q: 1 } };
  OwnIt.router.go({ game: 'quiz', roundId: 'trips-quiz-1' });
  assert.ok(urls[urls.length - 1].endsWith('#/play/quiz/trips-quiz-1'));
  OwnIt.router.go('home');
  assert.ok(!urls[urls.length - 1].includes('#'));
  env.window.location.hash = '#/play/quiz/trips-quiz-1';
  assert.equal(OwnIt.router.restore(), true);
  assert.equal(OwnIt.router.current().roundId, 'trips-quiz-1');
  env.window.location.hash = '#/play/quiz/missing-round';
  assert.equal(OwnIt.router.restore(), false, 'unknown round: stay home');
});
