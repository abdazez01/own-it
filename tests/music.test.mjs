import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from './fake-dom.mjs';

function boot() {
  const env = createEnv();
  env.load('z.js', 'music.js');
  return env.window.OwnIt;
}

const C_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
const plan = (OwnIt, bar) => JSON.parse(JSON.stringify(OwnIt.musicPlan(bar)));
const allBars = (OwnIt) => Array.from({ length: 32 }, (_, b) => plan(OwnIt, b));

test('all music midi in C major pitch classes', () => {
  const OwnIt = boot();
  let seen = 0;
  for (const events of allBars(OwnIt)) {
    for (const e of events) {
      if (e.midi === undefined) continue;
      seen++;
      assert.ok(Number.isInteger(e.midi), 'midi integer');
      assert.ok(C_MAJOR.has(e.midi % 12), 'pitch class ' + (e.midi % 12) + ' in ' + e.layer);
    }
  }
  assert.ok(seen > 200);
});

test('all non-turnaround note starts are multiples of 0.5s', () => {
  const OwnIt = boot();
  for (const events of allBars(OwnIt)) {
    for (const e of events) {
      if (e.layer === 'turn') continue;
      assert.ok(e.t >= 0 && e.t < 4, 't inside bar');
      assert.ok(Math.abs(e.t / 0.5 - Math.round(e.t / 0.5)) < 1e-9, e.layer + ' at ' + e.t);
    }
  }
});

test('section layers follow PLAN table over 32 bars', () => {
  const OwnIt = boot();
  // spec 4.3: [pad, bass, arp, drums, mel] per section of 4 bars
  const TABLE = [
    [1, 1, 0, 0, 0], [1, 1, 1, 0, 0], [1, 1, 1, 1, 0], [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1], [1, 1, 1, 1, 0], [1, 1, 1, 0, 0], [1, 1, 0, 0, 0],
  ];
  const bars = allBars(OwnIt);
  for (let bar = 0; bar < 32; bar++) {
    const layers = new Set(bars[bar].map((e) => e.layer));
    const [pad, bass, arp, drums, mel] = TABLE[Math.floor(bar / 4)];
    assert.equal(layers.has('pad'), !!pad, 'pad bar ' + bar);
    assert.equal(layers.has('bass'), !!bass, 'bass bar ' + bar);
    assert.equal(layers.has('arp'), !!arp, 'arp bar ' + bar);
    assert.equal(layers.has('mel'), !!mel, 'mel bar ' + bar);
    for (const l of ['kick', 'snare']) assert.equal(layers.has(l), !!drums, l + ' bar ' + bar);
    assert.equal(layers.has('hat'), !!(drums || arp), 'hat bar ' + bar);
    assert.equal(layers.has('turn'), bar === 31, 'turn bar ' + bar);
  }
  // progression B only in sections 5 and 6
  const bassRoots = (bar) => bars[bar].filter((e) => e.layer === 'bass').map((e) => e.midi);
  assert.ok(bassRoots(16).includes(41) && bassRoots(17).includes(43) && bassRoots(18).includes(40) && bassRoots(19).includes(45));
  assert.ok(bassRoots(0).includes(36) && bassRoots(1).includes(43) && bassRoots(2).includes(45) && bassRoots(3).includes(41));
  assert.ok(bassRoots(24).includes(36), 'section 7 back to A');
  // it loops: bar 32 equals bar 0
  assert.deepEqual(plan(OwnIt, 32), plan(OwnIt, 0));
});

test('fade levels at section edges match 0.3/0.6/0.85/1 and 1/0.85/0.55/0.28', () => {
  const OwnIt = boot();
  const arpVel = (bar) => Math.max(...plan(OwnIt, bar).filter((e) => e.layer === 'arp').map((e) => e.vel));
  const full = arpVel(8); // section 3, arp at full level
  // arp enters at section 2 (bars 4-7), leaves at section 7 (bars 24-27)
  [0.3, 0.6, 0.85, 1].forEach((lv, i) => assert.ok(Math.abs(arpVel(4 + i) / full - lv) < 1e-9, 'in ' + i));
  [1, 0.85, 0.55, 0.28].forEach((lv, i) => assert.ok(Math.abs(arpVel(24 + i) / full - lv) < 1e-9, 'out ' + i));
  assert.deepEqual([0, 1, 2, 3].map((b) => OwnIt.musicLevel('mel', 12 + b)), [0.3, 0.6, 0.85, 1]);
  assert.deepEqual([0, 1, 2, 3].map((b) => OwnIt.musicLevel('drum', 20 + b)), [1, 0.85, 0.55, 0.28]);
  assert.equal(OwnIt.musicLevel('mel', 0), 0);
  // pad re-enters at 55% then 85% then 100% after the turnaround
  const padVel = (bar) => plan(OwnIt, bar).find((e) => e.layer === 'pad').vel;
  assert.ok(Math.abs(padVel(0) / padVel(2) - 0.55) < 1e-9);
  assert.ok(Math.abs(padVel(1) / padVel(2) - 0.85) < 1e-9);
});

test('no note in arp/mel outlasts its bar boundary by more than 0.05s', () => {
  const OwnIt = boot();
  let n = 0;
  for (const events of allBars(OwnIt)) {
    for (const e of events) {
      if (e.layer !== 'arp' && e.layer !== 'mel') continue;
      n++;
      assert.ok(e.t + e.dur <= 4 + 0.05, e.layer + ' ends ' + (e.t + e.dur));
    }
  }
  assert.ok(n > 100);
});

test('planner is pure: same bar gives same plan', () => {
  const OwnIt = boot();
  assert.deepEqual(plan(OwnIt, 13), plan(OwnIt, 13));
  for (const e of plan(OwnIt, 31).filter((x) => x.layer === 'turn')) assert.ok(e.kind);
});
