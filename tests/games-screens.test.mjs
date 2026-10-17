import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createEnv } from './fake-dom.mjs';

const require = createRequire(import.meta.url);
const core = require('../own-it/assets/core.js');
const ASSETS = new URL('../own-it/assets/', import.meta.url);
const FILES = ['z.js', 'icons.js', 'router.js', 'flap.js', 'toggle.js', 'juice.js', 'keys.js', 'link.js', 'shell.js', 'gamekit.js', 'screenhost.js'];
const DOC = '<!doctype html>';
const CSP = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; form-action \'none\'; base-uri \'none\'">';

const live = [];
after(() => live.forEach((f) => { try { f(); } catch { /* already cleaned */ } }));

const SCREENS = {
  s1: { zone: 'trips', html: '<main><button data-ownit="btn-cancel">Cancel</button><button data-ownit="btn-release">Release</button><p>Sample</p></main>', inputs: {} },
  s2: { zone: 'trips', html: '<main><h1>Two</h1></main>', inputs: {} },
  s3: { zone: 'trips', html: '<main><h1>Three</h1></main>', inputs: {} },
};
const TAGS = { s1: ['btn-cancel', 'btn-release'], s2: [], s3: [] };

// A fake document stands in for iframe.contentDocument. Tests fire `load` themselves.
function boot(game, round, { exam = false } = {}) {
  const env = createEnv({ reduced: true });
  env.load(...FILES);
  const w = env.window;
  w.TextDecoder = TextDecoder;
  w.OWNIT_SCREENS = SCREENS;
  vm.runInContext(readFileSync(new URL('core.js', ASSETS), 'utf8'), env.ctx, { filename: 'core.js' });
  let decodes = 0;
  const real = w.OwnItCore.decode;
  w.OwnItCore.decode = (s) => { decodes++; return real(s); };
  const sounds = [];
  w.OwnIt.audio = { play: (n) => sounds.push(n) };
  let shakes = 0, confetti = 0;
  w.OwnIt.juice.shake = () => { shakes++; };
  w.OwnIt.juice.confetti = () => { confetti++; };
  if (exam) w.OwnIt.mode = 'exam';
  let clock = 0;
  w.performance = { now: () => clock };
  const ticks = [];
  w.setInterval = (f) => { ticks.push(f); return ticks.length; };
  w.clearInterval = (id) => { ticks[id - 1] = null; };

  const frames = [];
  const realCreate = env.document.createElement;
  env.document.createElement = (tag) => {
    const el = realCreate(tag);
    if (String(tag).toLowerCase() === 'iframe') {
      const inner = createEnv().document;
      el.contentDocument = inner;
      el.inner = inner;
      frames.push(el);
    }
    return el;
  };
  vm.runInContext(readFileSync(new URL(`games/${game}.js`, ASSETS), 'utf8'), env.ctx, { filename: `${game}.js` });
  const root = env.document.createElement('div');
  env.document.body.appendChild(root);
  const finished = [];
  const ctx = {
    game, roundId: `trips-${game}-1`, root, router: { go() {} }, toast() {},
    keys: { on: (k, f) => w.OwnIt.keys.on(k, f, game) },
    finish: (p) => finished.push(p),
  };
  w.OwnIt.keys.setScope(game);
  const cleanup = w.OwnIt.games.get(game).play(root, round, ctx);
  live.push(cleanup);
  const key = (k) => env.document.dispatchEvent(env.event('keydown', { key: k }));
  // Builds the tagged elements for the latest iframe and fires its load event, like the browser would after srcdoc parses.
  const load = (screenId, tags = TAGS[screenId] || []) => {
    const f = frames[frames.length - 1];
    f.scrolls = 0;
    for (const id of tags) {
      const d = f.inner.createElement('button');
      d.setAttribute('data-ownit', id);
      d.scrollIntoView = () => { f.scrolls++; };
      f.inner.body.appendChild(d);
    }
    f.dispatchEvent(env.event('load', { bubbles: false }));
    return f;
  };
  return { env, w, root, key, sounds, finished, cleanup, frames, load, ctx, setTime: (ms) => { clock = ms; }, tick: () => ticks.slice().forEach((f) => f && f()), counts: { decodes: () => decodes, shakes: () => shakes, confetti: () => confetti } };
}

const tourRound = () => ({
  zone: 'trips', mode: 'practice', screen: 's1',
  steps: [
    { kind: 'chain', prompt: 'What happens when you tap this?', element: 'btn-cancel', choices: ['asks manager first', 'cancels at once', 'does nothing'], answer: core.encode('asks manager first') },
    { kind: 'find', prompt: 'Where would a driver release the cable?', answer: core.encode('btn-release') },
    { kind: 'role', prompt: 'Who can see this screen?', choices: ['Manager', 'Driver'], answer: core.encode('Manager') },
  ],
});

const guessRound = () => ({
  zone: 'trips', mode: 'practice',
  screens: ['s1', 's2', 's3'].map((s, i) => ({ screen: s, choices: ['alpha', 'beta', 'gamma', 'delta'], answer: core.encode(['beta', 'alpha', 'delta'][i]) })),
});

// ---- screenhost

test('screenhost srcdoc includes CSP meta', () => {
  const env = createEnv({ reduced: true });
  env.load('z.js', 'screenhost.js');
  env.window.OWNIT_SCREENS = SCREENS;
  const box = env.document.createElement('div');
  env.document.body.appendChild(box);
  const host = env.window.OwnIt.screenhost.mount(box, 's1');
  const f = box.querySelector('iframe');
  assert.ok(f && host.iframe === f);
  assert.equal(f.getAttribute('sandbox'), 'allow-same-origin');
  assert.doesNotMatch(f.getAttribute('sandbox'), /allow-scripts/);
  const src = f.getAttribute('srcdoc');
  assert.ok(src.startsWith(DOC + CSP), 'doctype first, then the CSP meta');
  assert.ok(src.endsWith(SCREENS.s1.html));
});

test('screenhost never puts screen html in the host document and the source avoids innerHTML', () => {
  const env = createEnv({ reduced: true });
  env.load('z.js', 'screenhost.js');
  env.window.OWNIT_SCREENS = SCREENS;
  const box = env.document.createElement('div');
  env.document.body.appendChild(box);
  env.window.OwnIt.screenhost.mount(box, 's1');
  assert.equal(box.querySelectorAll('[data-ownit]').length, 0);
  assert.doesNotMatch(box.textContent, /Sample/);
  const src = readFileSync(new URL('engine/screenhost.js', ASSETS), 'utf8');
  assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|DOMParser|adoptNode|importNode|document\.write/);
});

test('pick on data-ownit fires callback', () => {
  const t = boot('screen-tour', tourRound());
  const box = t.env.document.createElement('div');
  t.env.document.body.appendChild(box);
  const host = t.w.OwnIt.screenhost.mount(box, 's1');
  const picked = [];
  host.onPick((id) => picked.push(id));
  const f = t.frames[t.frames.length - 1];
  for (const id of TAGS.s1) { const d = f.inner.createElement('button'); d.setAttribute('data-ownit', id); f.inner.body.appendChild(d); }
  f.dispatchEvent(t.env.event('load', { bubbles: false }));
  assert.equal(JSON.stringify(host.ids()), '["btn-cancel","btn-release"]');
  f.inner.querySelectorAll('[data-ownit]')[1].click();
  assert.equal(JSON.stringify(picked), '["btn-release"]');
  // the hover outline style is created inside the iframe document through textContent
  const style = f.inner.head.querySelector('style');
  assert.ok(style && /outline/.test(style.textContent));
  // highlight marks the tagged element inside the iframe
  host.highlight('btn-cancel');
  assert.equal(f.inner.querySelectorAll('[data-ownit]')[0].getAttribute('data-ownit-hl'), '1');
  host.destroy();
});

test('screenhost handles an unknown screen with a visible note and no iframe', () => {
  const env = createEnv({ reduced: true });
  env.load('z.js', 'screenhost.js');
  env.window.OWNIT_SCREENS = SCREENS;
  const box = env.document.createElement('div');
  env.document.body.appendChild(box);
  const host = env.window.OwnIt.screenhost.mount(box, 'constructor');
  assert.equal(host.ok, false);
  assert.equal(box.querySelectorAll('iframe').length, 0);
  assert.match(box.textContent, /missing/);
});

// ---- screen tour

test('screen tour registers, mounts one sandboxed iframe, and hides answers until a pick', () => {
  const t = boot('screen-tour', tourRound());
  const def = t.w.OwnIt.games.get('screen-tour');
  assert.equal(def.id, 'screen-tour');
  assert.ok(def.keys.length >= 3);
  assert.equal(t.root.querySelectorAll('iframe').length, 1);
  assert.equal(t.root.querySelector('iframe').getAttribute('sandbox'), 'allow-same-origin');
  assert.equal(t.counts.decodes(), 0);
  assert.ok(!t.root.textContent.includes(tourRound().steps[0].answer));
});

test('screen tour: tap the element, pick the chain with a key, find by click, role by key, payload', () => {
  const t = boot('screen-tour', tourRound());
  const f = t.load('s1');
  const els = f.inner.querySelectorAll('[data-ownit]');
  const choiceBtns = () => t.root.querySelectorAll('.answer');
  // chain: choices stay hidden until the right element is tapped
  assert.equal(choiceBtns().length, 0);
  els[1].click();
  assert.equal(choiceBtns().length, 0);
  els[0].click();
  assert.equal(choiceBtns().length, 3);
  t.key('1'); // right
  assert.equal(t.counts.decodes(), 1);
  assert.ok(t.sounds.includes('correct'));
  t.key('Enter'); // next
  // find: wrong element first locks as a miss
  assert.equal(choiceBtns().length, 0);
  els[0].click();
  assert.ok(t.sounds.includes('wrong'));
  assert.equal(t.counts.shakes(), 1);
  t.key('Enter');
  // role
  assert.equal(choiceBtns().length, 2);
  t.key('b'); // Driver, wrong
  t.key('Enter');
  assert.equal(t.finished.length, 1);
  const p = t.finished[0];
  assert.equal(p.game, 'screen-tour');
  assert.equal(p.id, 'trips-screen-tour-1');
  assert.equal(p.got, 1);
  assert.equal(p.of, 3);
  assert.equal(JSON.stringify(p.missed), '["1","2"]');
  assert.equal(p.mode, 'practice');
  assert.equal(p.hintsUsed, 0);
  assert.ok(t.env.document.body.querySelector('.result-card'));
});

test('screen tour: keyboard path with arrows and Enter, and answers by tapping choices', () => {
  const t = boot('screen-tour', tourRound());
  const f = t.load('s1');
  assert.equal(f.inner.querySelectorAll('[data-ownit]')[0].getAttribute('data-ownit-hl'), '1'); // target is outlined
  t.key('Enter'); // taps it
  const btns = t.root.querySelectorAll('.answer');
  assert.equal(btns.length, 3);
  btns[1].click(); // touch pick, wrong
  assert.equal(t.sounds.filter((s) => s === 'wrong').length, 1);
  assert.ok(btns[0].classList.contains('right'));
  t.key('Enter');
  t.key('ArrowRight');
  t.key('ArrowRight'); // btn-release
  t.key('Enter'); // picks right element
  assert.ok(t.sounds.includes('correct'));
});

test('screen tour: exam mode shows no why and no hint button, an empty round does not crash', () => {
  const e = boot('screen-tour', { ...tourRound(), mode: 'exam' }, { exam: true });
  const f = e.load('s1');
  f.inner.querySelectorAll('[data-ownit]')[0].click();
  e.key('2');
  assert.equal(e.counts.confetti(), 0);
  assert.equal(e.counts.shakes(), 0);
  assert.match(e.root.textContent, /Locked in/);
  const z = boot('screen-tour', { zone: 'trips', screen: 's1', steps: [] });
  assert.match(z.root.textContent, /no steps/);
  assert.equal(z.finished.length, 0);
});

test('screen tour cleanup unbinds keys', () => {
  const t = boot('screen-tour', tourRound());
  t.load('s1');
  t.cleanup();
  t.key('ArrowRight');
  t.key('Enter');
  assert.equal(t.finished.length, 0);
});

// ---- guess the screen

test('guess score formula', () => {
  const t = boot('guess-the-screen', guessRound());
  const pts = t.w.OwnIt.guessPoints;
  assert.equal(pts(12), 10);
  assert.equal(pts(6), 5);
  assert.equal(pts(9), 8);
  assert.equal(pts(11), 9);
  assert.equal(pts(0), 1);
  assert.equal(pts(0.2), 1);
  assert.equal(pts(-3), 1);
});

test('guess the screen: blur steps 16 to 0, Space buzzes, choices appear after the buzz, points follow remaining time', () => {
  const t = boot('guess-the-screen', guessRound());
  t.load('s1');
  const frame = t.root.querySelector('.guess-screen');
  assert.ok(frame);
  assert.equal(frame.style.filter, 'blur(16px)');
  assert.ok(t.root.querySelector('.guess-choices').hasAttribute('hidden'));
  t.setTime(6000);
  t.tick();
  assert.equal(frame.style.filter, 'blur(8px)');
  t.setTime(3000);
  t.key(' '); // buzz at 3s: remaining 9 -> 8 points
  assert.ok(!t.root.querySelector('.guess-choices').hasAttribute('hidden'));
  assert.equal(t.counts.decodes(), 0);
  t.key('2'); // beta is right for the first screen
  assert.equal(t.counts.decodes(), 1);
  assert.ok(t.sounds.includes('correct'));
  assert.equal(frame.style.filter, 'blur(0px)');
  t.key('Enter');
  // second screen: buzz at once, then wrong
  t.setTime(0);
  t.load('s2');
  t.key(' ');
  t.key('4');
  assert.ok(t.sounds.includes('wrong'));
  t.key('Enter');
  // third: time runs out at 12s, choices open on their own, right answer is worth the 1 point floor
  t.setTime(0);
  t.load('s3');
  t.setTime(13000);
  t.tick();
  assert.ok(!t.root.querySelector('.guess-choices').hasAttribute('hidden'));
  t.key('c');
  t.key('Enter'); // wrong pick locked; Enter advances to finish
  assert.equal(t.finished.length, 1);
  const p = t.finished[0];
  assert.equal(p.game, 'guess-the-screen');
  assert.equal(p.got, 8);
  assert.equal(p.of, 30);
  assert.equal(JSON.stringify(p.missed), '["1","2"]');
});

test('guess the screen: big buzz button and tapped choices work without a keyboard; timeout right answer scores 1', () => {
  const t = boot('guess-the-screen', guessRound());
  t.load('s1');
  const buzz = t.root.querySelector('.buzz-btn');
  assert.ok(buzz);
  t.setTime(12000);
  buzz.click(); // remaining 0
  const btns = t.root.querySelector('.guess-choices').querySelectorAll('.answer');
  assert.equal(btns.length, 4);
  btns[1].click(); // beta, right: floor of 1
  const next = t.root.querySelector('.guess-next');
  assert.ok(next && !next.hasAttribute('hidden'));
  next.click();
  t.load('s2'); t.key(' '); t.key('1'); t.key('Enter'); // alpha right at remaining 12 -> 10
  t.load('s3'); t.key(' '); t.key('4'); t.key('Enter'); // delta right -> 10
  assert.equal(t.finished[0].got, 21);
  assert.equal(t.finished[0].of, 30);
  assert.equal(t.finished[0].missed.length, 0);
});

test('guess the screen: the screen copy is not interactive and cleanup unbinds Space', () => {
  const t = boot('guess-the-screen', guessRound());
  assert.ok(t.root.querySelector('.screen-frame').classList.contains('no-pointer'));
  t.cleanup();
  t.key(' ');
  assert.ok(t.root.querySelector('.guess-choices').hasAttribute('hidden'));
  assert.equal(t.finished.length, 0);
});

test('game page loads the new scripts and the sources avoid innerHTML', () => {
  const html = readFileSync(new URL('game.html', ASSETS), 'utf8');
  for (const s of ['engine/gamekit.js', 'engine/screenhost.js', 'games/screen-tour.js', 'games/guess-the-screen.js']) assert.ok(html.includes(`src="${s}"`), s);
  for (const f of ['games/screen-tour.js', 'games/guess-the-screen.js']) {
    assert.doesNotMatch(readFileSync(new URL(f, ASSETS), 'utf8'), /innerHTML|outerHTML|insertAdjacentHTML/, f);
  }
});

// ---- fix round 1

test('screenhost blocks navigation: anchors and submit buttons are default-prevented, foreign meta and base are removed', () => {
  const t = boot('screen-tour', tourRound());
  const f = t.frames[t.frames.length - 1];
  const inner = f.inner;
  const mk = (tag, attrs) => { const e = inner.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); inner.body.appendChild(e); return e; };
  const ours = inner.createElement('meta'); ours.setAttribute('http-equiv', 'Content-Security-Policy'); inner.head.appendChild(ours);
  const foreign = mk('meta', { 'http-equiv': 'refresh', content: '0;url=http://evil.example' });
  const base = mk('base', { href: 'http://evil.example/' });
  const a = mk('a', { href: 'http://evil.example/x' });
  const submit = mk('button', { type: 'submit' });
  const plain = mk('p', {});
  f.dispatchEvent(t.env.event('load', { bubbles: false }));
  assert.equal(foreign.parentNode, null);
  assert.equal(base.parentNode, null);
  assert.notEqual(ours.parentNode, null);
  for (const el of [a, submit]) {
    const ev = t.env.event('click'); el.dispatchEvent(ev);
    assert.ok(ev.defaultPrevented, el.tagName);
  }
  const ev = t.env.event('click'); plain.dispatchEvent(ev);
  assert.ok(!ev.defaultPrevented);
});

test('screenhost: a blocked-pointer frame is inert and out of the tab order; moving scrolls the target into view', () => {
  const t = boot('guess-the-screen', guessRound());
  const f = t.frames[0];
  assert.equal(f.getAttribute('tabindex'), '-1');
  assert.ok(f.hasAttribute('inert'));
  const env = createEnv({ reduced: true });
  env.load('z.js', 'screenhost.js');
  env.window.OWNIT_SCREENS = SCREENS;
  const box = env.document.createElement('div');
  env.document.body.appendChild(box);
  const host = env.window.OwnIt.screenhost.mount(box, 's1');
  const fr = box.querySelector('iframe');
  const inner = createEnv().document;
  fr.contentDocument = inner;
  let scrolled = 0;
  for (const id of TAGS.s1) { const d = inner.createElement('button'); d.setAttribute('data-ownit', id); d.scrollIntoView = () => { scrolled++; }; inner.body.appendChild(d); }
  fr.dispatchEvent(env.event('load', { bubbles: false }));
  host.move(1);
  assert.equal(scrolled, 1);
});

test('tour dead ends: a missing screen or an untagged element degrades to choices or a Skip button', () => {
  // chain whose element is not tagged after load: choices open straight away
  const t = boot('screen-tour', tourRound());
  t.load('s1', ['btn-release']);
  assert.equal(t.root.querySelectorAll('.answer').length, 3);
  t.key('1'); t.key('Enter');
  // find: always skippable, a skip scores 0 and counts as missed
  const skip = Array.from(t.root.querySelectorAll('button')).find((b) => /Skip/.test(b.textContent));
  assert.ok(skip && !skip.hasAttribute('hidden'));
  skip.click();
  assert.match(t.root.textContent, /release/);
  t.key('Enter');
  t.key('1'); t.key('Enter');
  const p = t.finished[0];
  assert.equal(p.got, 2);
  assert.equal(JSON.stringify(p.missed), '["1"]');

  // missing screen: no iframe, the chain step still works from its choices, the find step can be skipped
  const m = boot('screen-tour', { ...tourRound(), screen: 'nope' });
  assert.equal(m.root.querySelectorAll('iframe').length, 0);
  assert.equal(m.root.querySelectorAll('.answer').length, 3);
  m.key('1'); m.key('Enter');
  Array.from(m.root.querySelectorAll('button')).find((b) => /Skip/.test(b.textContent)).click();
  m.key('Enter');
  m.key('1'); m.key('Enter');
  assert.equal(m.finished[0].got, 2);
});

test('Enter and Space only act from the game area or the page, never from shell buttons', () => {
  const press = (t, k, target) => {
    const ev = t.env.event('keydown', { key: k });
    ev.target = target;
    t.env.document.dispatchEvent(ev);
    return ev;
  };
  const header = (t) => t.root.querySelector('header').querySelector('button');
  const tour = boot('screen-tour', tourRound());
  tour.load('s1');
  const e1 = press(tour, 'Enter', header(tour));
  assert.ok(!e1.defaultPrevented);
  assert.equal(tour.root.querySelectorAll('.answer').length, 0);
  const e2 = press(tour, 'Enter', tour.env.document.body); // from the page: taps the highlighted element
  assert.ok(e2.defaultPrevented);
  assert.equal(tour.root.querySelectorAll('.answer').length, 3);

  const guess = boot('guess-the-screen', guessRound());
  guess.load('s1');
  const s1 = press(guess, ' ', header(guess));
  assert.ok(!s1.defaultPrevented);
  assert.ok(guess.root.querySelector('.guess-choices').hasAttribute('hidden'));
  const s2 = press(guess, ' ', guess.env.document.body);
  assert.ok(s2.defaultPrevented);
  assert.ok(!guess.root.querySelector('.guess-choices').hasAttribute('hidden'));
});

test('games show labels from round.labels while comparing ids', () => {
  const g = guessRound();
  g.labels = { alpha: { label: 'Trip list' }, beta: { label: 'Cancel trip' } };
  const t = boot('guess-the-screen', g);
  t.load('s1');
  t.key(' ');
  const text = Array.from(t.root.querySelector('.guess-choices').querySelectorAll('.answer-text')).map((x) => x.textContent);
  assert.equal(JSON.stringify(text), '["Trip list","Cancel trip","gamma","delta"]');
  t.key('2');
  assert.equal(t.sounds.includes('correct'), true); // beta is the id behind "Cancel trip"
  assert.match(t.root.textContent, /Cancel trip/);
});

test('kit: label falls back to a humanised id and ignores inherited keys', () => {
  const env = createEnv({ reduced: true });
  env.load('z.js', 'gamekit.js');
  const kit = env.window.OwnIt.kit;
  assert.equal(kit.label('btn-cancel', null), 'btn cancel');
  assert.equal(kit.label('a', { a: { label: 'Alpha' } }), 'Alpha');
  assert.equal(kit.label('constructor', {}), 'constructor');
  assert.equal(kit.label('Ask the manager', {}), 'Ask the manager');
});
