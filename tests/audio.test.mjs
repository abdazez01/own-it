import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from './fake-dom.mjs';

// A generic fake Web Audio graph: every create* returns a chainable node, and we count what is scheduled.
function fakeAudio(win) {
  const log = { osc: 0, src: 0, started: 0, ctxs: 0 };
  const node = () => {
    const store = {};
    return new Proxy(function () { return node(); }, {
      get(_t, p) {
        if (p in store) return store[p];
        if (p === 'connect') return (x) => x || node();
        if (p === 'start') return () => { log.started++; };
        if (p === 'getChannelData') return () => new Float32Array(2048);
        if (p === 'then') return undefined;
        return node();
      },
      set(_t, p, v) { store[p] = v; return true; },
      apply() { return node(); },
    });
  };
  class FakeCtx {
    constructor() { log.ctxs++; this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = node(); }
    createOscillator() { log.osc++; return node(); }
    createBufferSource() { log.src++; return node(); }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(Math.min(len, 4096)) }; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
  }
  for (const n of ['createGain', 'createBiquadFilter', 'createDynamicsCompressor', 'createConvolver', 'createDelay', 'createStereoPanner', 'createWaveShaper']) {
    FakeCtx.prototype[n] = function () { return node(); };
  }
  win.AudioContext = FakeCtx;
  return log;
}

function boot(withAudio) {
  const env = createEnv();
  const log = withAudio ? fakeAudio(env.window) : null;
  env.load('z.js', 'music.js', 'audio.js');
  return { OwnIt: env.window.OwnIt, win: env.window, log };
}

const NAMES = ['press', 'hover', 'clack', 'toggle', 'correct', 'wrong', 'combo', 'streak-break', 'levelup', 'claim', 'hint', 'fog-lift', 'tick', 'alarm', 'build-wait'];

test('audio.play before unlock does not throw', () => {
  const { OwnIt } = boot(false);
  for (const n of NAMES) assert.doesNotThrow(() => OwnIt.audio.play(n, 3));
  assert.doesNotThrow(() => OwnIt.audio.unlock());
  assert.doesNotThrow(() => OwnIt.audio.play('press', 'card'));
  assert.doesNotThrow(() => OwnIt.music.start());
  assert.doesNotThrow(() => OwnIt.music.stop());
  assert.doesNotThrow(() => OwnIt.audio.duck(1200));
  assert.equal(typeof OwnIt.audio.toggleMute(), 'boolean');
});

test('defaults are sfx on, music on, volume 0.8', () => {
  const { OwnIt } = boot(false);
  assert.deepEqual({ ...OwnIt.audio.settings }, { sfx: true, music: true, volume: 0.8 });
  assert.equal(OwnIt.audio.getVolume(), 0.8);
});

test('every catalogue sound schedules audio once unlocked', () => {
  const { OwnIt, log } = boot(true);
  OwnIt.audio.unlock();
  OwnIt.audio.settings.music = false;
  for (const n of NAMES.filter((x) => x !== 'build-wait')) {
    const before = log.started;
    OwnIt.audio.play(n, n === 'press' ? 'tile' : 4);
    assert.ok(log.started > before, n + ' scheduled nothing');
  }
  OwnIt.audio.stop('build-wait');
});

test('muted audio schedules nothing', () => {
  const { OwnIt, log } = boot(true);
  OwnIt.audio.unlock();
  OwnIt.music.stop();
  assert.equal(OwnIt.audio.toggleMute(), true);
  const before = log.started;
  for (const n of NAMES) OwnIt.audio.play(n, 2);
  OwnIt.music.start();
  assert.equal(log.started, before);
  assert.equal(OwnIt.audio.toggleMute(), false);
  assert.equal(OwnIt.audio.settings.sfx, true);
  OwnIt.music.stop();
});

test('clack is rate limited to one per 55 ms', () => {
  const { OwnIt, log } = boot(true);
  OwnIt.audio.unlock();
  OwnIt.audio.settings.music = false;
  OwnIt.audio.play('clack');
  const after1 = log.started;
  OwnIt.audio.play('clack');
  assert.equal(log.started, after1);
});

test('voice cap keeps at most 12 sfx voices', () => {
  const { OwnIt } = boot(true);
  OwnIt.audio.unlock();
  OwnIt.audio.settings.music = false;
  for (let i = 0; i < 40; i++) OwnIt.audio.play('toggle');
  assert.ok(OwnIt.audio._voiceCount() <= 12);
});

test('setVolume clamps and persists through localStorage when present', () => {
  const { OwnIt, win } = boot(false);
  const store = {};
  win.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  OwnIt.audio.setVolume(2);
  assert.equal(OwnIt.audio.getVolume(), 1);
  OwnIt.audio.setVolume(0.3);
  assert.equal(store['ownit-volume'], '0.3');
  OwnIt.audio.setSfx(false);
  assert.equal(store['ownit-sfx'], 'off');
});

test('throwing localStorage never breaks settings', () => {
  const { OwnIt, win } = boot(false);
  Object.defineProperty(win, 'localStorage', { get() { throw new Error('blocked'); } });
  assert.doesNotThrow(() => OwnIt.audio.setVolume(0.5));
  assert.equal(OwnIt.audio.getVolume(), 0.5);
});

test('field draws one static frame under reduced motion and starts/stops cleanly', () => {
  const env = createEnv({ reduced: true });
  env.load('z.js', 'field.js');
  let fills = 0;
  const g2 = new Proxy({}, { get: (_t, p) => (p === 'fill' ? () => { fills++; } : () => {}), set: () => true });
  const canvas = env.document.createElement('canvas');
  canvas.getContext = () => g2;
  env.window.OwnIt.field.start(canvas);
  assert.equal(env.window.OwnIt.field._count(), Math.min(26, Math.round(1280 * 800 / 52000)));
  assert.ok(fills >= env.window.OwnIt.field._count());
  assert.equal(canvas.getAttribute('aria-hidden'), 'true');
  env.window.OwnIt.field.stop();
});
