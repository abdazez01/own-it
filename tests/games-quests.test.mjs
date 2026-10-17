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

const live = [];
after(() => live.forEach((f) => { try { f(); } catch { /* already cleaned */ } }));

const SCREENS = {
  s1: { zone: 'trips', html: '<main><button data-ownit="el-open">Open</button><button data-ownit="el-help">Help</button></main>', inputs: {} },
  s2: { zone: 'trips', html: '<main><button data-ownit="el-approve">Approve</button><button data-ownit="el-back">Back</button></main>', inputs: {} },
};
const TAGS = { s1: ['el-open', 'el-help'], s2: ['el-approve', 'el-back'] };

function questRound(over = {}) {
  return {
    id: 'trips-quests-1', game: 'quests', zone: 'trips', mode: 'practice', flow: 'f1', goal: 'Cancel a trip and get it approved', start: 's1',
    objectives: [{ text: 'Open the trip', element: 'el-open' }, { text: 'Approve the cancel as manager', element: 'el-approve' }],
    answer: core.encode([
      { element: 'el-open', on: 's1', does: 'f1', goes: 's2' },
      { element: 'el-approve', on: 's2', does: 'f1' },
    ]),
    nav: {
      'el-open': { on: 's1', goes: 's2', roles: ['driver'] },
      'el-help': { on: 's1' },
      'el-approve': { on: 's2', roles: ['manager'] },
      'el-back': { on: 's2', goes: 's1' },
    },
    labels: {
      driver: { label: 'Driver' }, manager: { label: 'Manager' },
      'el-open': { label: 'Open trip' }, 'el-help': { label: 'Help link', purpose: 'Shows the help page, not part of cancelling.' },
      'el-approve': { label: 'Approve' }, 'el-back': { label: 'Back' }, s1: { label: 'Trip screen' }, s2: { label: 'Approvals' },
    },
    ...over,
  };
}

function boot(round, { exam = false, screens = SCREENS } = {}) {
  const env = createEnv({ reduced: true });
  env.load(...FILES);
  const w = env.window;
  w.TextDecoder = TextDecoder;
  w.OWNIT_SCREENS = screens;
  vm.runInContext(readFileSync(new URL('core.js', ASSETS), 'utf8'), env.ctx, { filename: 'core.js' });
  let decodes = 0;
  const realDecode = w.OwnItCore.decode;
  w.OwnItCore.decode = (x) => { decodes++; return realDecode(x); };
  const results = [];
  w.OwnIt.resultCard = (c, r) => { results.push(r); if (r.payload) c.finish(r.payload); return { sent: true }; };
  const routed = [];
  const sounds = [];
  w.OwnIt.audio = { play: (n) => sounds.push(n) };
  let shakes = 0, confetti = 0;
  w.OwnIt.juice.shake = () => { shakes++; };
  w.OwnIt.juice.confetti = () => { confetti++; };
  if (exam) w.OwnIt.mode = 'exam';
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
  vm.runInContext(readFileSync(new URL('games/quests.js', ASSETS), 'utf8'), env.ctx, { filename: 'quests.js' });
  const root = env.document.createElement('div');
  env.document.body.appendChild(root);
  const finished = [], toasts = [];
  const ctx = {
    game: 'quests', roundId: round.id, root, router: { go: (r) => routed.push(r) }, toast: (m) => toasts.push(m),
    keys: { on: (k, f) => w.OwnIt.keys.on(k, f, 'quests') },
    finish: (p) => finished.push(p),
  };
  w.OwnIt.keys.setScope('quests');
  const cleanup = w.OwnIt.games.get('quests').play(root, round, ctx);
  live.push(cleanup);
  const key = (k) => env.document.dispatchEvent(env.event('keydown', { key: k }));
  const buttons = (scope) => Array.from((scope || env.document.body).querySelectorAll('button'));
  const press = (text) => {
    const b = buttons().find((x) => x.textContent.trim() === text);
    assert.ok(b, `button "${text}"`);
    b.dispatchEvent(env.event('click'));
  };
  // Fires the load event for the latest iframe with the tagged elements of the screen it shows.
  const load = (screenId) => {
    const f = frames[frames.length - 1];
    for (const id of TAGS[screenId] || []) {
      const d = f.inner.createElement('button');
      d.setAttribute('data-ownit', id);
      f.inner.body.appendChild(d);
    }
    f.dispatchEvent(env.event('load', { bubbles: false }));
    return f;
  };
  const click = (id) => {
    const f = frames[frames.length - 1];
    const el = f.inner.body.querySelector(`[data-ownit="${id}"]`);
    assert.ok(el, `tagged ${id}`);
    el.dispatchEvent(env.event('click'));
  };
  const start = () => { press('Start quest'); return load('s1'); };
  const rows = () => Array.from(root.querySelectorAll('.quest-row'));
  return { routed, results, decodes: () => decodes, env, w, root, key, sounds, finished, toasts, cleanup, frames, load, click, press, start, rows, buttons, counts: { shakes: () => shakes, confetti: () => confetti } };
}

test('quest pop-up opens first with the goal and numbered objectives, and Start begins the quest', () => {
  const t = boot(questRound());
  const dlg = t.env.document.body.querySelector('.dialog');
  assert.ok(dlg, 'pop-up is open');
  assert.match(dlg.textContent, /Cancel a trip and get it approved/);
  assert.match(dlg.textContent, /Open the trip/);
  assert.match(dlg.textContent, /Approve the cancel as manager/);
  assert.equal(t.frames.length, 1, 'the first screen is mounted behind the pop-up');
  t.start();
  assert.equal(t.env.document.body.querySelector('.dialog'), null);
  assert.equal(t.rows().length, 2, 'objectives are pinned in the panel');
});

test('in-order clicks tick objectives', () => {
  const t = boot(questRound());
  t.start();
  t.click('el-open');
  assert.equal(t.rows()[0].getAttribute('data-state'), 'done');
  assert.equal(t.rows()[1].getAttribute('data-state'), 'now');
  assert.deepEqual(t.sounds.filter((s) => s === 'correct'), ['correct']);
  assert.equal(t.counts.confetti(), 1);
  t.load('s2');
  t.press('Switch role');
  t.press('Manager');
  t.click('el-approve');
  assert.equal(t.rows()[1].getAttribute('data-state'), 'done');
  assert.equal(t.counts.confetti() >= 2, true);
  assert.equal(t.finished.length, 1);
  const p = t.finished[0];
  assert.equal(p.game, 'quests');
  assert.equal(p.got, 2);
  assert.equal(p.of, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(p.wrong)), []);
});

test('wrong element counts wrong turn and shows its purpose', () => {
  const t = boot(questRound());
  t.start();
  t.click('el-help');
  assert.equal(t.counts.shakes(), 1);
  assert.ok(t.sounds.includes('wrong'));
  assert.equal(t.rows()[0].getAttribute('data-state'), 'now', 'nothing ticked');
  const text = t.root.textContent;
  assert.match(text, /That's not how this flow goes\. Why\?/);
  assert.match(text, /Shows the help page, not part of cancelling\./);
  assert.match(text, /-5 XP/);
  assert.equal(t.frames.length, 1, 'a wrong turn does not navigate');
  t.click('el-open');
  t.load('s2');
  t.press('Switch role');
  t.press('Manager');
  t.click('el-approve');
  const p = t.finished[0];
  assert.deepEqual(JSON.parse(JSON.stringify(p.wrong)), [['el-help', 'el-open']]);
});

test('goes navigates to next screen', () => {
  const t = boot(questRound());
  t.start();
  assert.match(t.frames[0].getAttribute('srcdoc'), /el-open/);
  t.click('el-open');
  assert.equal(t.frames.length, 2, 'second screen mounted');
  assert.match(t.frames[1].getAttribute('srcdoc'), /el-approve/);
  assert.equal(t.root.querySelectorAll('iframe').length, 1, 'the old screen is removed');
});

test('role switch required step', () => {
  const t = boot(questRound());
  t.start();
  assert.match(t.root.textContent, /Driver/, 'starts as the role of the first step');
  t.click('el-open');
  t.load('s2');
  t.click('el-approve'); // still a driver
  assert.equal(t.rows()[1].getAttribute('data-state'), 'now');
  assert.match(t.root.textContent, /Manager/);
  assert.match(t.root.textContent, /switch role/i);
  t.key('r'); // R opens the role switcher
  const dlg = t.env.document.body.querySelector('.dialog');
  assert.ok(dlg, 'role switcher open');
  assert.deepEqual(t.buttons(dlg).map((b) => b.textContent.trim()).filter((x) => /Driver|Manager/.test(x)), ['Driver', 'Manager']);
  t.press('Manager');
  assert.equal(t.env.document.body.querySelector('.dialog'), null);
  t.click('el-approve');
  assert.equal(t.finished.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(t.finished[0].wrong)), [['el-approve', 'el-approve']], 'the early click was one wrong turn');
});

test('clean completion plays levelup; wrong turns cost 5 and the summary shows done, wrong turns and time', () => {
  const t = boot(questRound());
  t.start();
  t.click('el-open');
  t.load('s2');
  t.press('Switch role');
  t.press('Manager');
  t.click('el-approve');
  assert.ok(t.sounds.includes('levelup'));
  assert.match(t.root.textContent, /2 of 2 objectives/);
  assert.match(t.root.textContent, /0 wrong turns/);
  assert.match(t.root.textContent, /\d\d:\d\d/);
  const dirty = boot(questRound());
  dirty.start();
  dirty.click('el-help');
  dirty.click('el-help');
  dirty.click('el-open');
  dirty.load('s2');
  dirty.press('Switch role');
  dirty.press('Manager');
  dirty.click('el-approve');
  assert.ok(!dirty.sounds.includes('levelup'));
  assert.match(dirty.root.textContent, /2 wrong turns/);
  assert.equal(dirty.finished[0].wrong.length, 2);
});

test('answers stay encoded in the round and are decoded only per click', () => {
  const round = questRound();
  const t = boot(round);
  assert.doesNotMatch(JSON.stringify(round.objectives), /does|goes/);
  t.start();
  const src = readFileSync(new URL('games/quests.js', ASSETS), 'utf8');
  assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML/);
});

test('Q shows the quest list again and Enter on the pop-up starts', () => {
  const t = boot(questRound());
  const dlg = t.env.document.body.querySelector('.dialog');
  dlg.dispatchEvent(t.env.event('keydown', { key: 'Enter' }));
  assert.equal(t.env.document.body.querySelector('.dialog'), null);
  t.load('s1');
  t.key('q');
  const q = t.env.document.body.querySelector('.dialog');
  assert.ok(q);
  assert.match(q.textContent, /Open the trip/);
  t.press('Back to quest');
  assert.equal(t.env.document.body.querySelector('.dialog'), null);
});

test('a missing screen falls back to buttons for the elements on it', () => {
  const t = boot(questRound(), { screens: {} });
  t.press('Start quest');
  assert.match(t.root.textContent, /This screen copy is missing/);
  t.press('Open trip');
  assert.equal(t.rows()[0].getAttribute('data-state'), 'done');
});

test('exam mode keeps the purpose hidden', () => {
  const t = boot(questRound({ mode: 'exam' }), { exam: true });
  t.start();
  t.click('el-help');
  assert.doesNotMatch(t.root.textContent, /Shows the help page/);
  assert.match(t.root.textContent, /That's not how this flow goes/);
});

test('game page loads quests.js and ignores keys while the pop-up is open', () => {
  const html = readFileSync(new URL('game.html', ASSETS), 'utf8');
  assert.ok(html.includes('src="games/quests.js"'));
  const t = boot(questRound());
  t.key('r');
  assert.equal(t.env.document.body.querySelectorAll('.dialog').length, 1, 'R does not stack a second dialog');
});

const finishRun = (t) => {
  t.click('el-open'); t.load('s2'); t.press('Switch role'); t.press('Manager'); t.click('el-approve');
};

test('keys typed inside the screen copy are relayed to the game (R opens the role switcher)', () => {
  const t = boot(questRound());
  const f = t.start();
  const inner = f.inner.body.querySelector('[data-ownit="el-help"]');
  inner.dispatchEvent(t.env.event('keydown', { key: 'r' }));
  assert.ok(t.env.document.body.querySelector('.dialog'), 'role switcher opened from inside the iframe');
});

test('relay ignores Enter and modified keys, and typing in a field except Escape', () => {
  const t = boot(questRound());
  const f = t.start();
  const field = f.inner.createElement('input');
  f.inner.body.appendChild(field);
  field.dispatchEvent(t.env.event('keydown', { key: 'r' }));
  field.dispatchEvent(t.env.event('keydown', { key: 'q', ctrlKey: true }));
  assert.equal(t.env.document.body.querySelector('.dialog'), null);
});

test('Esc inside the screen asks to leave, and Leave goes Home; Back on the pop-up goes Home', () => {
  const t = boot(questRound());
  const f = t.start();
  f.inner.body.querySelector('[data-ownit="el-help"]').dispatchEvent(t.env.event('keydown', { key: 'Escape' }));
  assert.match(t.env.document.body.querySelector('.dialog').textContent, /Leave this game/);
  t.press('Leave');
  assert.deepEqual(t.routed, ['home']);
  const u = boot(questRound());
  u.press('Back');
  assert.deepEqual(u.routed, ['home']);
});

test('Enter on the pop-up does not start the quest when focus is on Back', () => {
  const t = boot(questRound());
  const back = t.buttons().find((b) => b.textContent.trim() === 'Back');
  back.dispatchEvent(t.env.event('keydown', { key: 'Enter' }));
  assert.ok(t.env.document.body.querySelector('.dialog'), 'still open');
  assert.deepEqual(t.routed, []);
});

test('arrows move over tagged elements and Enter taps the current one', () => {
  const t = boot(questRound());
  t.start();
  t.key('ArrowRight'); // el-open
  t.key('ArrowRight'); // el-help
  t.key('Enter');
  assert.equal(t.rows()[0].getAttribute('data-state'), 'now');
  assert.equal(t.finished.length, 0);
  t.key('ArrowLeft'); // back to el-open
  t.key('Enter');
  assert.equal(t.rows()[0].getAttribute('data-state'), 'done');
});

test('cleanup removes the iframe and the key handlers', () => {
  const t = boot(questRound());
  t.start();
  t.cleanup();
  assert.equal(t.root.querySelectorAll('iframe').length, 0);
  t.key('r'); t.key('q');
  assert.equal(t.env.document.body.querySelector('.dialog'), null);
});

test('score is 10 per objective plus 50 clean, minus 5 per wrong turn', () => {
  const clean = boot(questRound());
  clean.start(); finishRun(clean);
  assert.equal(clean.results[0].xp, 2 * 10 + 50);
  const dirty = boot(questRound());
  dirty.start();
  dirty.click('el-help'); dirty.click('el-help'); dirty.click('el-help');
  finishRun(dirty);
  assert.equal(dirty.results[0].xp, 2 * 10 - 3 * 5);
});

test('the expected path is decoded once per tap and never otherwise', () => {
  const t = boot(questRound());
  t.start();
  t.key('ArrowRight'); t.key('r'); t.press('Cancel');
  assert.equal(t.decodes(), 0);
  t.click('el-help');
  assert.equal(t.decodes(), 1);
  t.click('el-open');
  assert.equal(t.decodes(), 2);
});

test('exam mode does not name the required role', () => {
  const t = boot(questRound({ mode: 'exam' }), { exam: true });
  t.start(); t.click('el-open'); t.load('s2'); t.click('el-approve');
  assert.match(t.root.textContent, /Wrong account for this step\./);
  assert.doesNotMatch(t.root.textContent, /Manager/);
});

// ---- role switch lands on the right screen (fix wave 16b)

test('switching role loads the first screen of that role when the next objective is not theirs', () => {
  const t = boot(questRound());
  t.start();
  assert.equal(t.frames.length, 1);
  t.press('Switch role'); t.press('Manager');
  assert.equal(t.frames.length, 2, 'the manager screen (s2) is mounted');
  t.load('s2');
  t.click('el-approve');
  assert.equal(t.rows()[0].getAttribute('data-state'), 'now', 'approve is not the next step yet, so it is a wrong turn');
});

test('switching role loads the next objective screen when that objective needs the new role, and not again if already there', () => {
  const nav = { 'el-open': { on: 's1', roles: ['driver'] }, 'el-help': { on: 's1' }, 'el-approve': { on: 's2', roles: ['manager'] }, 'el-back': { on: 's2', goes: 's1' } };
  const t = boot(questRound({ nav }));
  t.start();
  t.click('el-open');
  const after = t.frames.length;
  assert.equal(after, 2, 'the next objective screen was loaded by the tick');
  t.load('s2');
  t.press('Switch role'); t.press('Manager');
  assert.equal(t.frames.length, after, 'already on the right screen: no reload');
  t.click('el-approve');
  assert.equal(t.finished.length, 1);
});

test('leaving with the intro open closes the pop-up, and the page loads rounds.js and feedback.js before boot', () => {
  const t = boot(questRound());
  assert.equal(t.env.document.body.querySelectorAll('.dialog').length, 1);
  t.cleanup();
  assert.equal(t.env.document.body.querySelectorAll('.dialog').length, 0);
  assert.deepEqual(t.routed, [], 'closing on leave does not navigate again');
  const html = readFileSync(new URL('game.html', ASSETS), 'utf8');
  for (const f of ['rounds.js', 'feedback.js']) assert.ok(html.indexOf(`src="${f}"`) > 0 && html.indexOf(`src="${f}"`) < html.indexOf('OwnIt.router.go'), f);
  assert.match(readFileSync(new URL('engine/ui.css', ASSETS), 'utf8'), /\.wb-card \{[^}]*overflow-wrap: normal; word-break: normal; hyphens: auto/);
});
