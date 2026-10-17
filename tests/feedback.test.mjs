import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { run as feedback } from '../own-it/scripts/lib/cmd-build-feedback.mjs';
import { writeJson } from '../own-it/scripts/lib/json.mjs';
import { tmpProject, ctx } from './helpers.mjs';

function setup() {
  const root = tmpProject({ 'a.txt': 'x\n' });
  writeJson(join(root, '.own-it', 'session.json'), { session: 's', mode: 'practice', missions: {}, rounds: { 'trips-quiz-1': { game: 'quiz', zone: 'trips', rung: 'words', mode: 'practice', cardIds: [] } } });
  return root;
}
const put = (root, obj) => { const p = join(root, '.own-it', 'fb.json'); writeFileSync(p, JSON.stringify(obj)); return p; };
const go = (root, id, obj) => feedback({ _: [id, put(root, obj)], flags: {} }, ctx(root));
const out = (root, id) => join(root, '.own-it', 'data', `feedback-${id}.js`);

test('writes the registry file and returns the id', async () => {
  const root = setup();
  const r = await go(root, 'trips-quiz-1', { grades: { q1: 'solid', q2: 'miss' }, debrief: 'Short debrief.', notes: { k: 'note' } });
  assert.deepEqual(r, { id: 'trips-quiz-1' });
  const win = {};
  vm.runInNewContext(readFileSync(out(root, 'trips-quiz-1'), 'utf8'), { window: win });
  assert.deepEqual(JSON.parse(JSON.stringify(win.OWNIT_FEEDBACK['trips-quiz-1'])), { grades: { q1: 'solid', q2: 'miss' }, debrief: 'Short debrief.', notes: { k: 'note' } });
});

test('rejects bad input and writes nothing', async () => {
  const root = setup();
  const bad = [
    ['unknown round', 'nope-1', { debrief: 'x' }, /unknown round/],
    ['bad grade value', 'trips-quiz-1', { grades: { q1: 'great' } }, /grades/],
    ['bad grade key', 'trips-quiz-1', { grades: { q9: 'solid' } }, /grades/],
    ['long debrief', 'trips-quiz-1', { debrief: Array(121).fill('w').join(' ') }, /120 words/],
    ['em dash debrief', 'trips-quiz-1', { debrief: 'a \u2014 b' }, /dash/],
    ['en dash note', 'trips-quiz-1', { notes: { k: 'a \u2013 b' } }, /dash/],
    ['long note', 'trips-quiz-1', { notes: { k: 'x'.repeat(301) } }, /300/],
    ['empty', 'trips-quiz-1', {}, /nothing/],
    ['extra key', 'trips-quiz-1', { debrief: 'x', bogus: 1 }, /bogus/],
  ];
  for (const [name, id, obj, re] of bad) await assert.rejects(go(root, id, obj), re, name);
  assert.equal(existsSync(out(root, 'trips-quiz-1')), false);
});

test('usage and unsafe round id', async () => {
  const root = setup();
  await assert.rejects(feedback({ _: [], flags: {} }, ctx(root)), /usage: build-feedback/);
  await assert.rejects(feedback({ _: ['__proto__', 'x'], flags: {} }, ctx(root)), /unknown round|missing/);
});

test('merges with existing feedback for the round and rebuilds feedback.js', async () => {
  const root = setup();
  await go(root, 'trips-quiz-1', { grades: { q1: 'solid' }, notes: { a: 'one' }, debrief: 'First.' });
  await go(root, 'trips-quiz-1', { grades: { q2: 'miss', q1: 'partial' }, notes: { b: 'two' } });
  let win = {};
  vm.runInNewContext(readFileSync(out(root, 'trips-quiz-1'), 'utf8'), { window: win });
  assert.deepEqual(JSON.parse(JSON.stringify(win.OWNIT_FEEDBACK['trips-quiz-1'])),
    { grades: { q1: 'partial', q2: 'miss' }, notes: { a: 'one', b: 'two' }, debrief: 'First.' });
  await go(root, 'trips-quiz-1', { debrief: 'Second.' });
  win = {};
  vm.runInNewContext(readFileSync(join(root, '.own-it', 'feedback.js'), 'utf8'), { window: win });
  assert.equal(win.OWNIT_FEEDBACK['trips-quiz-1'].debrief, 'Second.');
  assert.equal(win.OWNIT_FEEDBACK['trips-quiz-1'].grades.q2, 'miss');
});
