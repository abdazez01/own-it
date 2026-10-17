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
  env.window.OWNIT_ROUNDS = { 'quiz-r1': { q: 1 } };
  assert.equal(OwnIt.router.go({ game: 'quiz', roundId: 'r1' }), true);
  assert.equal(OwnIt.router.current().game, 'quiz');
  assert.equal(stage.children.length, 1);
  assert.equal(stage.children[0].getAttribute('data-game'), 'quiz');
  assert.equal(seen.root, stage.children[0]);
  assert.equal(seen.round.q, 1);
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
