import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from './fake-dom.mjs';
import { listGames } from '../own-it/scripts/lib/games.mjs';

const FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js', 'gamekit.js', 'home.js', 'tour.js'];
const PROGRESS = { xp: 340, zones: {
  trips: { name: 'Trips', rungs: { words: 'cleared', map: 'open', trace: 'locked', break: 'locked', boss: 'locked' }, claimed: false, fogged: false, weakSpots: [] },
} };

function boot({ seen = false } = {}) {
  const env = createEnv({ reduced: true });
  env.load(...FILES);
  const w = env.window;
  w.OWNIT_GAMES = listGames();
  w.OWNIT_PROGRESS = PROGRESS;
  w.OWNIT_RECS = [{ game: 'quiz', zone: 'trips', reason: 'Your app talks about trips.' }];
  const stage = env.document.createElement('div');
  stage.setAttribute('id', 'stage');
  env.document.body.appendChild(stage);
  w.OwnIt.register({ id: 'quiz', name: 'quiz', keys: [], play() {} });
  if (seen) w.OwnIt.kit.markSeen('home');
  const all = (sel) => Array.from(env.document.body.querySelectorAll(sel));
  return { env, w, stage, all, home: () => w.OwnIt.router.go('home'), text: () => env.document.body.textContent };
}
const named = (x, label) => x.all('button').find((b) => b.textContent === label);

test('the home tour has the seven steps, in order, and starts by itself on the first visit', () => {
  const x = boot();
  x.home();
  const bubbles = x.all('.coach-bubble');
  assert.equal(bubbles.length, 1, 'the tour opens on the first visit');
  const steps = x.w.OwnIt.tour.steps();
  assert.deepEqual([...steps.map((s) => s.title)], ['Recommended', 'Departures', 'Game library', 'Practice or Exam', 'XP and Claimed', 'Sound and music', 'Help']);
  assert.match(steps[1].text, /Words, Map, Trace, Break, Boss/);
  assert.match(steps[1].text, /claim/);
  assert.match(x.text(), /1 of 7/);
  assert.match(x.text(), /games picked for your app/);
});

test('tour controls: Next, Back, Esc and Skip; the seen flag stops it from starting again', () => {
  const x = boot();
  x.home();
  named(x, 'Next').click();
  assert.match(x.text(), /2 of 7/);
  named(x, 'Back').click();
  assert.match(x.text(), /1 of 7/);
  for (let i = 0; i < 3; i++) named(x, 'Next').click();
  assert.match(x.text(), /4 of 7/);
  assert.match(x.text(), /Practice: hints are allowed/);
  assert.match(x.text(), /Exam: no hints and no debrief until the end/);
  x.all('.coach-bubble')[0].dispatchEvent(x.env.event('keydown', { key: 'ArrowRight' }));
  assert.match(x.text(), /5 of 7/);
  x.all('.coach-bubble')[0].dispatchEvent(x.env.event('keydown', { key: 'Escape' }));
  assert.equal(x.all('.coach-bubble').length, 0, 'Esc skips');
  assert.equal(x.w.OwnIt.kit.tutorialSeen('home'), true);
  x.home();
  assert.equal(x.all('.coach-bubble').length, 0, 'seen: no second automatic tour');
});

test('tour: Skip ends it, and the last step finishes with Done', () => {
  const a = boot();
  a.home();
  named(a, 'Skip').click();
  assert.equal(a.all('.coach-bubble').length, 0);
  assert.equal(a.w.OwnIt.kit.tutorialSeen('home'), true);
  const b = boot();
  b.home();
  for (let i = 0; i < 6; i++) named(b, 'Next').click();
  assert.match(b.text(), /7 of 7/);
  assert.match(b.text(), /Show me around/);
  named(b, 'Done').click();
  assert.equal(b.all('.coach-bubble').length, 0);
  assert.equal(b.w.OwnIt.kit.tutorialSeen('home'), true);
});

test('the Help panel restarts the tour with Show me around', () => {
  const x = boot({ seen: true });
  x.home();
  assert.equal(x.all('.coach-bubble').length, 0);
  x.w.OwnIt.keys.help();
  named(x, 'Show me around').click();
  assert.equal(x.all('.coach-bubble').length, 1);
  assert.match(x.text(), /1 of 7/);
  assert.equal(x.all('.scrim').length, 0, 'the help panel closes');
});

test('the Practice versus Exam popover is always on the page, opens from the i button, and states the real rules', () => {
  const x = boot({ seen: true });
  x.home();
  const pop = x.all('.mode-pop')[0];
  assert.ok(pop, 'the popover exists');
  assert.match(pop.textContent, /Practice: hints are allowed.*debrief after each round/);
  assert.match(pop.textContent, /Exam: no hints and no debrief until the end.*report card per zone: defensible, shaky or blind spot/);
  assert.equal(pop.hasAttribute('hidden'), true);
  const btn = x.all('.mode-info-btn')[0];
  assert.equal(btn.getAttribute('aria-label'), 'Practice versus Exam');
  btn.click();
  assert.equal(pop.hasAttribute('hidden'), false);
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  btn.click();
  assert.equal(pop.hasAttribute('hidden'), true);
});
