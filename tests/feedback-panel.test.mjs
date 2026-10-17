import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from './fake-dom.mjs';

const text = (n) => n.textContent;
function boot() {
  const env = createEnv();
  env.load('z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js');
  const stage = env.document.createElement('div');
  stage.setAttribute('id', 'stage');
  env.document.body.appendChild(stage);
  return env;
}
const panels = (env) => env.document.body.children.filter((c) => (c.getAttribute('class') || '').includes('feedback-panel'));

test('debrief panel appears after the result, as text, and goes away on leave', () => {
  const env = boot();
  const { OwnIt } = env.window;
  let ctx;
  OwnIt.register({ id: 'quiz', play(root, round, c) { ctx = c; } });
  OwnIt.router.go({ game: 'quiz', roundId: 'trips-quiz-1' });
  env.window.OWNIT_FEEDBACK = { 'trips-quiz-1': { debrief: 'Missed <b>x</b>.', notes: { k: 'a note' } } };
  assert.equal(panels(env).length, 0, 'not before the result');
  ctx.finish({ id: 'trips-quiz-1' });
  const p = panels(env);
  assert.equal(p.length, 1);
  assert.ok(text(p[0]).includes('Missed <b>x</b>.'));
  assert.ok(text(p[0]).includes('a note'));
  OwnIt.router.go('home');
  assert.equal(panels(env).length, 0);
  OwnIt.link.stop();
});

test('debrief that arrives after the result shows once on new data', () => {
  const env = boot();
  const { OwnIt } = env.window;
  let ctx;
  OwnIt.register({ id: 'quiz', play(root, round, c) { ctx = c; } });
  OwnIt.router.go({ game: 'quiz', roundId: 'trips-quiz-2' });
  ctx.finish({});
  assert.equal(panels(env).length, 0);
  env.window.OWNIT_FEEDBACK = { 'trips-quiz-2': { debrief: 'Later debrief.' } };
  assert.equal(OwnIt.link.subscriberCount(), 1);
  OwnIt.router.go('home');
  assert.equal(OwnIt.link.subscriberCount(), 0);
  OwnIt.link.stop();
});

test('feedback without a debrief shows no panel', () => {
  const env = boot();
  const { OwnIt } = env.window;
  let ctx;
  OwnIt.register({ id: 'quiz', play(root, round, c) { ctx = c; } });
  OwnIt.router.go({ game: 'quiz', roundId: 'trips-quiz-3' });
  env.window.OWNIT_FEEDBACK = { 'trips-quiz-3': { grades: { q1: 'solid' } } };
  ctx.finish({});
  assert.equal(panels(env).length, 0);
  OwnIt.router.go('home');
  OwnIt.link.stop();
});
