import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, FakeElement } from './fake-dom.mjs';

// The fake DOM has no Web Animations, canvas, Image or SVG geometry. These stubs let the animated sequence run, so the stage
// timings, the cooldown, the reduced-motion path and the cleanup can be checked. This file runs in its own process.
const anims = [];
FakeElement.prototype.animate = function (frames, opts) {
  const a = { el: this, frames, opts, cancelled: false, startTime: 0, cancel() { this.cancelled = true; } };
  a.effect = { target: this };
  anims.push(a);
  return a;
};
FakeElement.prototype.getTotalLength = () => 100;
FakeElement.prototype.cloneNode = function () { return new FakeElement(this.tagName, this.ownerDocument); };
FakeElement.prototype.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });

const FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js', 'gamekit.js', 'secret.js'];

function boot({ reduced = false } = {}) {
  anims.length = 0;
  const env = createEnv({ reduced });
  env.load(...FILES);
  const w = env.window;
  const S = w.OwnIt.secret;
  // fake clock: timers fire in order as tick() advances it
  let clock = 0, nextId = 1;
  const queue = new Map();
  w.setTimeout = (fn, ms) => { const id = nextId++; queue.set(id, { at: clock + (ms || 0), fn, id }); return id; };
  w.clearTimeout = (id) => { queue.delete(id); };
  const tick = (ms) => {
    const end = clock + ms;
    for (;;) {
      const due = [...queue.values()].filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      queue.delete(due.id);
      clock = due.at;
      due.fn();
    }
    clock = end;
  };
  const frames = [];
  const cancelled = [];
  w.requestAnimationFrame = (f) => { frames.push(f); return frames.length; };
  w.cancelAnimationFrame = (id) => { cancelled.push(id); };
  const log = [];
  w.OwnIt.sound = (n, a) => log.push({ n, a, t: clock });
  const images = [];
  w.Image = class { constructor() { images.push(this); } };
  w.XMLSerializer = class { serializeToString() { return '<div></div>'; } };
  let t = 1000;
  S.now = () => t;
  const dlg = env.document.createElement('div');
  dlg.setAttribute('class', 'dialog');
  env.document.body.appendChild(dlg);
  const mount = env.document.createElement('div');
  mount.setAttribute('id', 'stage');
  env.document.body.appendChild(mount);
  return {
    env, w, S, log, tick, dlg, images, frames, cancelled, pendingTimers: () => queue.size, body: env.document.body,
    advanceNow: (ms) => { t += ms; }, at: (name) => log.filter((e) => e.n === name),
    stage: () => env.document.body.querySelector('.secret-stage'),
    clock: () => clock,
  };
}
const fire = (el, type) => el.dispatchEvent({ type, bubbles: false, preventDefault() {} });

test('shatter: crack stages land at 0, 650 and 1350 ms, then the snapshot, the title smash and the continue, in order', () => {
  const h = boot();
  let done = 0;
  assert.equal(h.S.shatter(h.dlg, 50, 50, () => { done++; }), true);
  assert.deepEqual(h.at('crackStage').map((e) => [e.a, e.t]), [[1, 0]]);
  h.tick(649);
  assert.equal(h.at('crackStage').length, 1);
  h.tick(1);
  h.tick(699);
  assert.deepEqual(h.at('crackStage').map((e) => [e.a, e.t]), [[1, 0], [2, 650]]);
  h.tick(1);
  assert.deepEqual(h.at('crackStage').map((e) => e.a), [1, 2, 3]);
  assert.equal(h.clock(), 1350);
  assert.equal(h.images.length, 0, 'the bitmap snapshot waits for 1400');
  h.tick(50);
  assert.equal(h.images.length, 1);
  assert.match(h.images[0].src, /^data:image\/svg\+xml/);
  h.tick(649);
  assert.equal(h.at('whoosh').length, 0);
  h.tick(1);
  assert.equal(h.clock(), 2050);
  assert.equal(h.at('whoosh')[0].t, 2050);
  assert.equal(h.at('glass')[0].a.at, h.S.IMPACT / 1000, 'impact sounds are booked on the audio clock');
  assert.equal(h.at('rumble').pop().a.at, 0.565);
  assert.ok(h.frames.length > 0, 'the shard canvas runs on animation frames');
  // the title zoom is 690 ms from scale 3.4 with blur
  const zoom = anims.find((a) => a.opts && a.opts.duration === 690);
  assert.equal(zoom.frames[0].transform, 'scale(3.4)');
  assert.equal(zoom.frames[0].filter, 'blur(14px)');
  assert.equal(done, 0);
  h.tick(2200 - 1);
  assert.equal(h.stage().querySelector('.secret-title').classList.contains('live'), false);
  h.tick(1);
  assert.equal(h.stage().querySelector('.secret-title').classList.contains('live'), true);
  assert.equal(done, 0, 'it waits for the click');
  h.tick(2500);
  assert.equal(done, 1, 'with no click it continues by itself');
  assert.equal(h.at('whooshOut').length, 1);
  h.tick(1049);
  assert.ok(h.stage(), 'the outro keeps the layers until it is over');
  h.tick(1);
  assert.equal(h.stage(), null);
  assert.equal(h.pendingTimers(), 0);
});

test('shatter: clicking the title continues at once, once', () => {
  const h = boot();
  let done = 0;
  h.S.shatter(h.dlg, 50, 50, () => { done++; });
  h.tick(2050 + 2200);
  const title = h.stage().querySelector('.secret-title');
  title.dispatchEvent(h.env.event('click'));
  title.dispatchEvent(h.env.event('click'));
  assert.equal(done, 1);
  assert.equal(h.at('whooshOut').length, 1);
  h.tick(10000);
  assert.equal(done, 1);
});

test('shatter: a second start is ignored while breaking', () => {
  const h = boot();
  assert.equal(h.S.shatter(h.dlg, 5, 5, () => {}), true);
  assert.equal(h.S.shatter(h.dlg, 5, 5, () => {}), false);
  assert.equal(h.at('crackStage').length, 1);
});

test('appear: the stutter, the tear, the dropped tiles with ticks, then the idle breathe; hover is blocked until then', () => {
  const h = boot();
  const row = h.S.option(() => {});
  h.body.appendChild(row);
  assert.ok(row.hasAttribute('hidden'));
  h.tick(349);
  assert.equal(h.at('dread').length, 0);
  h.tick(1);
  assert.deepEqual(h.at('dread').map((e) => e.t), [350]);
  assert.equal(h.at('rumble')[0].a.s, 0.6);
  h.tick(859);
  assert.ok(row.hasAttribute('hidden'));
  h.tick(1);
  assert.ok(!row.hasAttribute('hidden'));
  assert.deepEqual(h.at('crackStage').map((e) => [e.a, e.t]), [[2, 1210]]);
  const ticks = h.at('crackle').filter((e) => e.a && e.a.n === 1);
  assert.equal(ticks.length, 0);
  h.tick(260 + 5 * 85);
  assert.equal(h.at('crackle').filter((e) => e.a && e.a.n === 1).length, 6, 'one tick per tile');
  fire(row, 'pointerenter');
  assert.equal(h.at('rumble').filter((e) => e.a === undefined).length, 0, 'no scare while entering');
  assert.ok(h.S.busy().entering);
  row.click();
  h.tick(3000);
  assert.ok(row.classList.contains('idle'));
  assert.equal(h.S.busy().entering, false);
  assert.equal(row.querySelector('.secret-desc').textContent, 'SOMETHING IS WRONG HERE');
});

test('scare: hover scrambles to SECRET, changes the text, and has a cooldown', () => {
  const h = boot();
  const row = h.S.option(() => {});
  h.body.appendChild(row);
  h.tick(5000);
  const plain = () => h.at('rumble').filter((e) => e.a === undefined).length;
  fire(row, 'pointerenter');
  fire(row, 'mouseenter');
  fire(row, 'focus');
  assert.equal(plain(), 1, 'one scare for one hover');
  assert.ok(h.at('crackle').some((e) => e.a && e.a.n === 10));
  h.tick(199);
  assert.equal(row.querySelector('.secret-desc').textContent, 'SOMETHING IS WRONG HERE');
  h.tick(1);
  assert.equal(row.querySelector('.secret-desc').textContent, 'CLAUDE FOUND A WAY IN');
  h.advanceNow(1499);
  fire(row, 'pointerenter');
  assert.equal(plain(), 1, 'still cooling down');
  h.advanceNow(2);
  fire(row, 'pointerenter');
  assert.equal(plain(), 2);
  assert.ok(anims.some((a) => a.frames.some((f) => f.filter === 'hue-rotate(90deg) saturate(2)')), 'the hue and scale pulse');
});

test('scare: blocked while breaking', () => {
  const h = boot();
  const row = h.S.option(() => {});
  h.body.appendChild(row);
  h.tick(5000);
  h.S.shatter(h.dlg, 5, 5, () => {});
  assert.equal(h.S.scare(false), false);
  assert.equal(h.S.scare(true), false);
});

test('reduced motion: fades only, no shake, no shards, the cracks and title still show', () => {
  const h = boot({ reduced: true });
  const row = h.S.option(() => {});
  h.body.appendChild(row);
  h.tick(350);
  assert.ok(!row.hasAttribute('hidden'));
  assert.ok(row.classList.contains('idle'));
  assert.equal(h.at('dread').length, 0);
  assert.equal(h.S.busy().entering, false);
  let done = 0;
  h.S.shatter(h.dlg, 20, 20, () => { done++; });
  assert.equal(h.at('crackStage').length, 0);
  assert.equal(h.at('glass').length, 1);
  assert.equal(h.stage().querySelectorAll('canvas').length, 0, 'no shard canvas');
  assert.ok(!anims.some((a) => a.frames.some((f) => /rotate\(/.test(f.transform || ''))), 'nothing shakes');
  const fade = anims.find((a) => a.el === h.dlg && a.opts.fill === 'forwards');
  assert.deepEqual([...fade.frames.map((f) => f.opacity)], [1, 0]);
  h.tick(900);
  const title = h.stage().querySelector('.secret-title');
  assert.ok(title.classList.contains('live'));
  assert.equal(title.style.opacity, '1');
  h.tick(2500);
  assert.equal(done, 1);
  assert.equal(h.at('whooshOut').length, 0, 'the whoosh is motion too');
  h.tick(700);
  assert.equal(h.stage(), null);
  assert.equal(h.pendingTimers(), 0);
});

test('reset: timers, frames, animations and layers are all cleaned up', () => {
  const h = boot();
  let done = 0;
  h.S.shatter(h.dlg, 50, 50, () => { done++; });
  h.tick(2100);
  assert.ok(h.stage());
  assert.ok(h.pendingTimers() > 0);
  assert.ok(h.frames.length > 0);
  h.S.reset();
  assert.equal(h.stage(), null);
  assert.equal(h.pendingTimers(), 0);
  assert.ok(h.cancelled.length > 0, 'the shard frame loop is cancelled');
  assert.ok(anims.every((a) => a.cancelled), 'every animation is cancelled');
  assert.deepEqual({ ...h.S.busy() }, { entering: false, breaking: false, outroing: false });
  const sounds = h.log.length;
  h.tick(20000);
  assert.equal(done, 0);
  assert.equal(h.log.length, sounds, 'nothing plays after the reset');
  assert.equal(h.images[0].onload, null);
});

test('leaving the screen mid-sequence cleans up, but opening the round from the outro does not', () => {
  const h = boot();
  h.S.shatter(h.dlg, 50, 50, () => {});
  h.tick(500);
  h.w.OwnIt.router.go('home');
  assert.equal(h.stage(), null);
  assert.equal(h.pendingTimers(), 0);

  const g = boot();
  g.S.shatter(g.dlg, 50, 50, () => { g.w.OwnIt.router.go('home'); });
  g.tick(2050 + 2200);
  g.stage().querySelector('.secret-title').dispatchEvent(g.env.event('click'));
  assert.ok(g.stage(), 'the round opening underneath leaves the outro playing');
  g.tick(1050);
  assert.equal(g.stage(), null);
});

test('a row whose dialog was closed during the entrance cleans itself up', () => {
  const h = boot();
  const row = h.S.option(() => {});
  h.body.appendChild(row);
  h.tick(900);
  row.remove();
  h.tick(5000);
  assert.equal(h.stage(), null);
  assert.equal(h.pendingTimers(), 0);
  assert.equal(h.S.busy().entering, false);
});
