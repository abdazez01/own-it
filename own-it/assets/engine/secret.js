/* own-it engine: the Secret level (OwnIt.secret). A hidden "break it" option in the level picker, its entrance, the hover scare,
   the crack-and-shatter BREAK IT sequence, the BROKEN reveal with its case report, and the decode of the obfuscated weakness.
   Quests is the first game to use it. The break only ever happens on a sandboxed screen copy with fake data; own-it never
   touches real code or systems. Effects respect prefers-reduced-motion (fades only: no shake, no shards) and mute (sound goes
   through the audio engine). Without the Web Animations API (old browsers, the test DOM) the plain class-based effects run.
   Load after gamekit.js. */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});

  var GAMES = ['quests'];                         // games that can offer the Secret level
  var HINTS = { role: 'Role', double: 'Timing', order: 'Order', input: 'Input' };
  var COOLDOWN = 1500, SHAKE_MS = 400, GIVE_UP_S = 180, DOUBLE_MS = 400;
  var NOTE = 'Claude will note this in chat. own-it never edits your code. Fix it after the session.';
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-:.';
  var JUNK = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789?!#%&';
  var NS = 'http://www.w3.org/2000/svg';
  var IMPACT = 565;                               // ms into the title zoom where it lands (offset .82 of 690ms)
  var G = 2600, FALL = 1.5, PERSP = 1100;         // shard physics: gravity, fall time (s), perspective
  var AUTO_CONTINUE = 2500;                       // BREAK IT continues by itself this long after "click to continue" shows

  function now() { return Date.now(); }
  function timer(fn, ms) { var t = setTimeout(fn, ms); try { if (t && t.unref) t.unref(); } catch (e) { /* browser timers */ } return t; }

  // The Secret option shows only for a game on the list, in a zone Claude recorded at least one weakness for.
  function isAvailable(game, zoneData) {
    return GAMES.indexOf(game) >= 0 && !!zoneData && Number(zoneData.weaknesses) > 0;
  }

  function hintLabel(kind) { return Object.prototype.hasOwnProperty.call(HINTS, kind) ? HINTS[kind] : ''; }

  // Time bonus: up to 20 XP, shrinking to 0 at the 3 minute limit. Wrong turns cost 5 each.
  function xp(secs, wrong) {
    var bonus = Math.max(0, Math.round((GIVE_UP_S - Math.max(0, secs)) / 9));
    return Math.max(0, 40 + bonus - 5 * (wrong | 0));
  }

  // The weakness is only decoded here, on a break or Reveal. Returns { steps, text, why, ref } or null.
  function decode(round) {
    try {
      var s = round && round.secret;
      if (!s || !s.answer || !window.OwnItCore) return null;
      var d = window.OwnItCore.decode(s.answer);
      return d && typeof d === 'object' && Array.isArray(d.steps) ? d : null;
    } catch (e) { return null; }
  }

  // Does the tail of the tap history perform the weakness? taps: [{id, role, t}], newest last.
  function triggered(kind, steps, taps) {
    if (!Array.isArray(steps) || !steps.length) return false;
    if (kind === 'double') {
      var a = taps[taps.length - 2], b = taps[taps.length - 1];
      return !!a && !!b && a.id === steps[0].element && b.id === a.id && b.t - a.t <= DOUBLE_MS;
    }
    if (taps.length < steps.length) return false;
    var tail = taps.slice(taps.length - steps.length);
    return steps.every(function (s, i) { return tail[i].id === s.element && (!s.role || tail[i].role === s.role); });
  }

  // ---------------------------------------------------------------- shared state and helpers

  var last = -1e9;                 // time of the last scare (cooldown)
  var timers = [];                 // pending sequence timers, all cleared by reset()
  var rafs = [];                   // pending animation frames
  var anims = [];                  // every Web Animation the sequence started
  var stage = null;                // the overlay layers, built on demand
  var row = null;                  // the picker row: { el, host, tiles, what }
  var entering = false, breaking = false, outroing = false;
  var web = null, pieces = null, pending = null, routerWatch = false;

  function sound(name, arg) { OwnIt.sound(name, arg); }
  function perf() { return window.performance && window.performance.now ? window.performance.now() : Date.now(); }
  function animOK() { return !!(document.body && typeof document.body.animate === 'function'); }

  function later(fn, ms) {
    var h = timer(function () {
      var i = timers.indexOf(h);
      if (i >= 0) timers.splice(i, 1);
      fn();
    }, ms);
    timers.push(h);
    return h;
  }

  function frame(fn) {
    var raf = window.requestAnimationFrame;
    if (typeof raf !== 'function') return null;
    var id = raf(function (ts) {
      var i = rafs.indexOf(id);
      if (i >= 0) rafs.splice(i, 1);
      fn(ts);
    });
    rafs.push(id);
    return id;
  }

  // el.animate that is remembered, so reset() can cancel it; null when the element cannot animate.
  function an(el, frames, opts) {
    if (!el || typeof el.animate !== 'function') return null;
    var a = el.animate(frames, opts);
    anims.push(a);
    return a;
  }

  function attached(el) {
    for (var n = el; n; n = n.parentNode) if (n === document.body) return true;
    return false;
  }

  function alive(me) { return row === me && attached(me.el); }

  function pick(n) { return JUNK.charAt(Math.floor(Math.random() * JUNK.length)); }

  // The page shakes as a damped sine: smooth, decays to rest. Every top-level page layer moves, the sequence layers stay put.
  function shakeTargets() {
    return Array.prototype.filter.call(document.body.children || [], function (c) {
      var tag = String(c.tagName || '').toLowerCase();
      return tag !== 'script' && tag !== 'style' && tag !== 'link' && !(c.classList && (c.classList.contains('secret-stage') || c.classList.contains('secret-veil') || c.classList.contains('toast')));
    });
  }
  function shake(ms, mag, delay) {
    if (OwnIt.reduced() || !animOK()) return;
    var frames = [], N = 28, px = Math.random() * 6, py = Math.random() * 6;
    for (var i = 0; i <= N; i++) {
      var p = i / N, f = Math.pow(1 - p, 2.2) * Math.min(1, p * 6);   // quick ramp-in, eased decay
      frames.push({ transform: 'translate(' + (Math.sin(p * 22 + px) * mag * 0.5 * f).toFixed(2) + 'px,' + (Math.sin(p * 17 + py) * mag * 0.35 * f).toFixed(2) + 'px) rotate(' + (Math.sin(p * 13) * mag * 0.04 * f).toFixed(3) + 'deg)' });
    }
    shakeTargets().forEach(function (el) { an(el, frames, { duration: ms, delay: delay || 0, easing: 'linear' }); });
  }
  function stopShakes() {
    var targets = shakeTargets();
    anims.forEach(function (a) { try { if (a && a.effect && targets.indexOf(a.effect.target) >= 0 && a.cancel) a.cancel(); } catch (e) { /* gone */ } });
  }

  // The red flicker and scanlines: opacity only, so they run on the compositor.
  function flick(alpha, ms, delay) {
    var S = ensureStage();
    an(S.flick, [{ opacity: 0 }, { opacity: alpha, offset: 0.18 }, { opacity: alpha * 0.25, offset: 0.45 }, { opacity: alpha * 0.55, offset: 0.6 }, { opacity: 0 }], { duration: ms * 2.6, delay: delay || 0, easing: 'ease-out' });
    an(S.scan, [{ opacity: 0 }, { opacity: 0.8, offset: 0.2 }, { opacity: 0.25, offset: 0.6 }, { opacity: 0 }], { duration: ms * 3, delay: delay || 0, easing: 'ease-out' });
  }

  function tileEl(parent, cls, text) {
    var t = OwnIt.el('span', { 'class': cls, 'aria-hidden': 'true' }, text);
    parent.appendChild(t);
    return t;
  }

  // The overlay layers, built once per sequence: flicker, scanlines, crack web (SVG), shard canvas host, darkness, BREAK IT title.
  function ensureStage() {
    if (stage) return stage;
    var root = OwnIt.el('div', { 'class': 'secret-stage' });
    var S = { root: root };
    S.flick = OwnIt.el('div', { 'class': 'secret-flick', 'aria-hidden': 'true' });
    S.scan = OwnIt.el('div', { 'class': 'secret-scan', 'aria-hidden': 'true' });
    S.svg = document.createElementNS(NS, 'svg');
    S.svg.setAttribute('class', 'secret-web');
    S.svg.setAttribute('aria-hidden', 'true');
    S.shards = OwnIt.el('div', { 'class': 'secret-shards', 'aria-hidden': 'true' });
    S.dark = OwnIt.el('div', { 'class': 'secret-dark', 'aria-hidden': 'true' });
    S.title = OwnIt.el('div', { 'class': 'secret-title' });
    S.tIn = OwnIt.el('div', { 'class': 'secret-title-in' });
    S.tFlap = OwnIt.el('div', { 'class': 'secret-title-flap', 'aria-hidden': 'true' });
    S.tiles = [];
    for (var i = 0; i < 8; i++) S.tiles.push(tileEl(S.tFlap, 'flap-tile alert', '?'));
    S.tSub = OwnIt.el('p', { 'class': 'secret-title-sub' }, 'Claude found a way to break this. Find it.');
    S.tHint = OwnIt.el('p', { 'class': 'secret-title-hint', 'aria-hidden': 'true' }, 'CLICK TO CONTINUE');
    [S.tFlap, S.tSub, S.tHint].forEach(function (c) { S.tIn.appendChild(c); });
    S.title.appendChild(S.tIn);
    [S.flick, S.scan, S.svg, S.shards, S.dark, S.title].forEach(function (c) { root.appendChild(c); });
    S.title.addEventListener('click', outro);
    S.title.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); outro(); } });
    document.body.appendChild(root);
    stage = S;
    return S;
  }

  // Everything the sequence owns goes: timers, frames, animations, canvases, layers. Safe to call at any time.
  function reset() {
    timers.splice(0).forEach(function (h) { clearTimeout(h); });
    var cancel = window.cancelAnimationFrame;
    rafs.splice(0).forEach(function (id) { if (typeof cancel === 'function') cancel(id); });
    anims.splice(0).forEach(function (a) { try { if (a && a.cancel) a.cancel(); } catch (e) { /* already gone */ } });
    if (pieces) { pieces.alive = false; if (pieces.loader) { pieces.loader.onload = null; pieces.loader.src = ''; } }
    if (stage && stage.root && stage.root.remove) stage.root.remove();
    stage = null; pieces = null; web = null; pending = null; row = null;
    entering = false; breaking = false; outroing = false;
  }

  // Leaving the screen the sequence lives on ends it, unless the sequence itself is what is opening the next screen.
  function watchRouter() {
    if (routerWatch || !OwnIt.router || !OwnIt.router.onChange) return;
    routerWatch = true;
    OwnIt.router.onChange(function () { if (!outroing && (stage || row || breaking || entering)) reset(); });
  }

  // ---------------------------------------------------------------- the plain page effects (also the fallback)

  function veil(cls, ms) {
    var v = OwnIt.el('div', { 'class': 'secret-veil ' + cls, 'aria-hidden': 'true' });
    document.body.appendChild(v);
    timer(function () { if (v.remove) v.remove(); }, ms);
    return v;
  }

  // The scare: the page shakes, flickers and shows scanlines, with a rumble and a crackle. A hover on the picker row also
  // pulses the row, scrambles it to SECRET and changes its text. Returns false while cooling down, entering or breaking.
  function scare(strong) {
    var t = OwnIt.secret.now();
    if (breaking || entering) return false;
    if (!strong && t - last < COOLDOWN) return false;
    last = t;
    if (!animOK()) {
      var body = document.body;
      if (!OwnIt.reduced()) {
        body.classList.remove('secret-shake');
        void body.offsetWidth;
        body.classList.add('secret-shake');
        timer(function () { body.classList.remove('secret-shake'); }, SHAKE_MS);
      }
      veil(OwnIt.reduced() ? 'flicker' : 'flicker scan' + (strong ? ' strong' : ''), strong ? 900 : 600);
      sound('rumble');
      sound('crackle');
      return true;
    }
    shake(700, strong ? 20 : 14);
    flick(strong ? 0.34 : 0.24, 240);
    sound('rumble');
    sound('crackle', { n: 10, g: 0.06 });
    if (!strong && row && alive(row)) rowScare(row);
    return true;
  }

  // Letters swap about 18 times a second (not every frame); each tile settles at its own time and flips in.
  function flipTiles(tiles, final, dur, cb) {
    if (OwnIt.reduced() || typeof window.requestAnimationFrame !== 'function') {
      tiles.forEach(function (t, i) { t.textContent = final.charAt(i) || ' '; });
      if (cb) cb();
      return;
    }
    var t0 = perf(), lastSwap = 0;
    (function step(ts) {
      var tnow = typeof ts === 'number' && ts > 0 ? ts : perf();
      var p = (tnow - t0) / dur, done = true, swap = tnow - lastSwap > 55;
      if (swap) lastSwap = tnow;
      tiles.forEach(function (t, i) {
        var settle = 0.35 + 0.6 * (i / tiles.length);
        var want = final.charAt(i) || ' ';
        if (p < settle) {
          done = false;
          if (swap) t.textContent = pick();
          var left = 1 - p / settle;                                   // the flip slows as the tile nears its settle point
          t.style.transform = 'rotateX(' + (Math.sin(tnow / 38 + i * 1.7) * 38 * left).toFixed(1) + 'deg)';
        } else if (t.textContent !== want) {
          t.textContent = want;
          an(t, [{ transform: 'rotateX(-70deg)' }, { transform: 'rotateX(12deg)', offset: 0.7 }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.3,1)' });
          t.style.transform = 'none';
        }
      });
      if (!done) frame(step); else if (cb) cb();
    })(t0);
  }

  function rowScare(r) {
    if (!OwnIt.reduced()) {
      r.el.classList.add('rgb');
      an(r.el, [{ filter: 'none', transform: 'scale(1)' }, { filter: 'hue-rotate(90deg) saturate(2)', transform: 'scale(1.025)', offset: 0.35 }, { filter: 'hue-rotate(20deg) saturate(1.3)', transform: 'scale(1.01)', offset: 0.7 }, { filter: 'none', transform: 'scale(1)' }], { duration: 900, easing: 'cubic-bezier(.3,.7,.3,1)' });
    }
    flipTiles(r.tiles, 'SECRET', 900, function () {
      r.el.classList.add('revealed');
      r.el.classList.remove('rgb');
      r.host.setAttribute('aria-label', 'SECRET');
    });
    an(r.what, [{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: 500, easing: 'ease-in-out' });
    later(function () { r.what.textContent = 'CLAUDE FOUND A WAY IN'; }, 200);
  }

  // Tiles scramble hard, then settle on text (used for the BROKEN banner). Reduced motion: straight to the text.
  function scramble(el, text, opts) {
    opts = opts || {};
    var str = String(text);
    if (el.__secretTimer) { clearInterval(el.__secretTimer); el.__secretTimer = null; }
    var settle = function () { OwnIt.flap(el, str, { instant: true, variant: opts.variant || 'alert' }); };
    if (OwnIt.reduced()) { settle(); return el; }
    var frames = 0, total = opts.frames || 10;
    var junk = function () {
      return Array.from(str).map(function (ch) { return ch === ' ' ? ' ' : GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length)); }).join('');
    };
    OwnIt.flap(el, junk(), { instant: true, variant: 'alert' });
    el.__secretTimer = setInterval(function () {
      frames++;
      if (frames >= total) { clearInterval(el.__secretTimer); el.__secretTimer = null; settle(); return; }
      OwnIt.flap(el, junk(), { instant: true, variant: 'alert' });
    }, 45);
    try { if (el.__secretTimer && el.__secretTimer.unref) el.__secretTimer.unref(); } catch (e) { /* browser timers */ }
    return el;
  }

  // ---------------------------------------------------------------- 1. the picker row and its entrance

  /* The picker row. It starts hidden and appears by itself (see appear). Hover or focus is the scare: the tiles scramble to
     SECRET and the text changes. onChoose runs on click (not while the row is entering or breaking). The caller wires the
     radio behaviour (data-id, arrows) like the other level rows. */
  function option(onChoose) {
    reset();
    watchRouter();
    var b = OwnIt.el('button', { type: 'button', role: 'radio', 'class': 'level-opt secret-opt', 'data-id': 'secret', 'aria-label': 'Secret level' });
    var host = OwnIt.el('span', { 'class': 'secret-tiles' });
    var what = OwnIt.el('span', { 'class': 'level-desc secret-desc' }, 'SOMETHING IS WRONG HERE');
    b.appendChild(host);
    b.appendChild(what);
    OwnIt.flap(host, '??????', { instant: true });
    var shown = false;
    if (animOK()) {
      row = { el: b, host: host, tiles: Array.prototype.slice.call(host.children || []), what: what };
      b.setAttribute('hidden', 'hidden');
    }
    appear(b);
    function reveal() {
      if (animOK()) { scare(false); return; }
      if (shown) return;
      shown = true;
      b.classList.add('revealed');
      scare(false);
      scramble(host, 'SECRET');
    }
    function hide() {
      if (animOK() || !shown) return;
      shown = false;
      b.classList.remove('revealed');
      scramble(host, '??????', { frames: 4 });
    }
    ['pointerenter', 'mouseenter', 'focus'].forEach(function (ev) { b.addEventListener(ev, reveal); });
    ['pointerleave', 'mouseleave', 'blur'].forEach(function (ev) { b.addEventListener(ev, hide); });
    b.addEventListener('click', function (e) { if (entering || breaking) return; if (onChoose) onChoose(e); });
    return b;
  }

  // Each letter flickers through junk before it lands. Returns the time the last letter has landed.
  function typeIn(guard, el, text, start, per) {
    el.textContent = '';
    text.split('').forEach(function (ch, i) {
      guard(function () { el.textContent = text.slice(0, i) + (ch === ' ' ? ' ' : pick()); }, start + i * per);
      guard(function () { el.textContent = text.slice(0, i + 1); }, start + i * per + per * 0.6);
    });
    return start + text.length * per;
  }

  /* The entrance: the lights stutter with a low drone, the row tears open out of nothing, the tiles drop in one by one with a
     tick each, a glitch with an RGB split runs, the text types in, then the row breathes. Reduced motion: a plain fade. */
  function appear(el) {
    if (!el) return el;
    var me = row && row.el === el ? row : null;
    if (!me || !animOK()) {                                   // no animation support: the short class-based entrance
      if (el.removeAttribute) el.removeAttribute('hidden');
      if (!OwnIt.reduced()) { el.classList.add('secret-appear'); timer(function () { el.classList.remove('secret-appear'); }, 600); }
      return el;
    }
    var guard = function (fn, ms) { return later(function () { if (!alive(me)) { reset(); return; } fn(); }, ms); };
    entering = true;
    later(function () {
      if (!alive(me)) { reset(); return; }
      var S = ensureStage();
      if (OwnIt.reduced()) {
        me.el.removeAttribute('hidden');
        me.el.classList.add('idle');
        an(me.el, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
        sound('crackle', { n: 4, g: 0.04 });
        entering = false;
        return;
      }
      // 1. the lights stutter while a low minor-second drone swells
      sound('dread'); sound('rumble', { s: 0.6 }); shake(900, 4);
      an(S.dark, [{ opacity: 0 }, { opacity: 0.7, offset: 0.1 }, { opacity: 0.15, offset: 0.18 }, { opacity: 0.8, offset: 0.34 }, { opacity: 0.3, offset: 0.46 }, { opacity: 0.92, offset: 0.72 }, { opacity: 0.92, offset: 0.9 }, { opacity: 0 }], { duration: 950, easing: 'linear' });
      sound('crackle', { n: 5, g: 0.03 });
      // 2. the drone snaps off as the row tears open
      guard(function () {
        var r = me.el, cs = window.getComputedStyle ? window.getComputedStyle(r) : null;
        var parentCs = window.getComputedStyle && r.parentNode && r.parentNode.nodeType !== 9 ? window.getComputedStyle(r.parentNode) : null;
        var pt = (cs && cs.paddingTop) || '11px', pb = (cs && cs.paddingBottom) || '11px';
        var gap = parseFloat(parentCs && parentCs.rowGap) || 8;
        r.removeAttribute('hidden'); r.classList.add('rgb');
        var h = r.offsetHeight || 48;
        an(r, [
          { height: '0px', minHeight: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: -gap + 'px', opacity: 0, clipPath: 'inset(50% 0 50% 0)', filter: 'brightness(3) saturate(2)' },
          { height: h + 'px', minHeight: '0px', paddingTop: pt, paddingBottom: pb, marginTop: '0px', opacity: 1, clipPath: 'inset(42% 0 42% 0)', filter: 'brightness(2.4) saturate(2)', offset: 0.35 },
          { height: h + 'px', minHeight: '0px', paddingTop: pt, paddingBottom: pb, marginTop: '0px', opacity: 1, clipPath: 'inset(0 0 0 0)', filter: 'none' }
        ], { duration: 560, easing: 'cubic-bezier(.2,.9,.3,1)' });
        sound('crackStage', 2); sound('rumble', { s: 1.1 }); flick(0.34, 190); shake(700, 16);
        an(S.scan, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.4, offset: 0.5 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
        // the tiles drop in one by one with a tick each
        me.tiles.forEach(function (t, i) {
          an(t, [{ transform: 'translateY(-26px) rotateX(-90deg)', opacity: 0 }, { transform: 'translateY(3px) rotateX(14deg)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }],
            { duration: 340, delay: 260 + i * 85, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
          guard(function () { sound('crackle', { n: 1, g: 0.07 }); }, 260 + i * 85);
        });
        guard(function () { r.classList.add('glitch'); }, 600);
        guard(function () { r.classList.remove('glitch', 'rgb'); }, 1160);
        var done = typeIn(guard, me.what, 'SOMETHING IS WRONG HERE', 700, 34);
        guard(function () { r.classList.add('idle'); entering = false; }, done + 100);
      }, 860);
    }, 350);
    return el;
  }

  // ---------------------------------------------------------------- 2. the crack web and the shard geometry

  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }

  // A crack line (a dark shadow under a light stroke), hidden until grow() reveals it with stroke-dashoffset.
  function crackPath(layer, pts, width, alpha) {
    var d = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' L');
    var shadow = document.createElementNS(NS, 'path'), line = document.createElementNS(NS, 'path');
    [[shadow, 'rgba(0,0,0,.55)', width + 1.6], [line, 'rgba(245,243,238,' + alpha + ')', width]].forEach(function (s) {
      s[0].setAttribute('d', d); s[0].setAttribute('fill', 'none'); s[0].setAttribute('stroke', s[1]); s[0].setAttribute('stroke-width', s[2]);
      s[0].setAttribute('stroke-linecap', 'round'); s[0].setAttribute('stroke-linejoin', 'round'); layer.appendChild(s[0]);
    });
    var L = line.getTotalLength ? line.getTotalLength() : 100, pair = [shadow, line];
    pair.forEach(function (p) { p.style.strokeDasharray = L + ' ' + L; p.style.strokeDashoffset = L; });
    return { els: pair, L: L, shown: 0 };
  }

  function grow(c, frac, dur, delay) {                       // reveal a path from its current fraction up to frac
    var from = c.L * (1 - c.shown), to = c.L * (1 - frac);
    c.shown = frac;
    c.els.forEach(function (p) { an(p, [{ strokeDashoffset: from }, { strokeDashoffset: to }], { duration: dur, delay: delay || 0, easing: 'cubic-bezier(.15,.75,.25,1)', fill: 'forwards' }); });
  }

  /* Rays from the impact, clipped to the dialog, revealed in three stages. The same rays and rings later become the shard
     edges, so the glass breaks along the cracks you saw. r is the dialog's layout rect. */
  function buildWeb(x, y, r, rad) {
    var S = ensureStage(), svg = S.svg;
    svg.setAttribute('width', window.innerWidth); svg.setAttribute('height', window.innerHeight);
    var cp = svgEl('clipPath', { id: 'secret-dlg-clip' }, svgEl('defs', {}, svg));
    svgEl('rect', { x: r.left, y: r.top, width: r.w, height: r.h, rx: rad }, cp);
    var layer = svgEl('g', { 'clip-path': 'url(#secret-dlg-clip)' }, svg);
    var reach = Math.max(Math.hypot(r.left - x, r.top - y), Math.hypot(r.right - x, r.top - y), Math.hypot(r.left - x, r.bottom - y), Math.hypot(r.right - x, r.bottom - y));
    var rays = [], spokes = 12;
    for (var i = 0; i < spokes; i++) {
      var a = (i + 0.15 + Math.random() * 0.7) / spokes * Math.PI * 2, len = reach * (0.95 + Math.random() * 0.3), pts = [[x, y]], px = x, py = y;
      for (var s = 0; s < 9; s++) { a += (Math.random() - 0.5) * 0.35; var step = len / 9 * (0.75 + Math.random() * 0.5); px += Math.cos(a) * step; py += Math.sin(a) * step; pts.push([px, py]); }
      rays.push({ pts: pts, far: [px + Math.cos(a) * 2000, py + Math.sin(a) * 2000], c: crackPath(layer, pts, 1.5 - i % 3 * 0.25, 0.9) });
    }
    var rings = [], mids = {};                               // concentric fracture rings linking the spokes (stage 2)
    [2, 4, 6].forEach(function (k, ri) {
      mids[k] = [];
      for (var j = 0; j < spokes; j++) {
        var p1 = rays[j].pts[k], p2 = rays[(j + 1) % spokes].pts[k], m = [(p1[0] + p2[0]) / 2 + (Math.random() - 0.5) * 16, (p1[1] + p2[1]) / 2 + (Math.random() - 0.5) * 16];
        mids[k][j] = m; rings.push({ c: crackPath(layer, [p1, m, p2], ri ? 0.9 : 1.1, ri ? 0.55 : 0.75), ri: ri });
      }
    });
    var branches = [];                                       // side splinters off the spokes (stage 3)
    rays.forEach(function (rr) {
      [3, 5, 7].forEach(function (k) {
        if (Math.random() < 0.45) return;
        var o = rr.pts[k], a2 = Math.atan2(o[1] - rr.pts[k - 1][1], o[0] - rr.pts[k - 1][0]) + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
        var pts2 = [o], qx = o[0], qy = o[1], len2 = 30 + Math.random() * 80;
        for (var s2 = 0; s2 < 4; s2++) { a2 += (Math.random() - 0.5) * 0.5; qx += Math.cos(a2) * len2 / 4; qy += Math.sin(a2) * len2 / 4; pts2.push([qx, qy]); }
        branches.push(crackPath(layer, pts2, 0.8, 0.55));
      });
    });
    return { rays: rays, rings: rings, mids: mids, branches: branches };
  }

  function cells(w) {                                        // shard polygons bounded by two neighbouring rays and two rings
    var out = [], K = [0, 2, 4, 6, 9, 'far'], n = w.rays.length;
    for (var j = 0; j < n; j++) {
      var A = w.rays[j], B = w.rays[(j + 1) % n];
      for (var q = 0; q < K.length - 1; q++) {
        var k0 = K[q], k1 = K[q + 1], poly = [];
        if (k1 === 'far') poly = [A.pts[9], A.far, B.far, B.pts[9]];
        else {
          for (var i = k0; i <= k1; i++) poly.push(A.pts[i]);
          if (w.mids[k1]) poly.push(w.mids[k1][j]);
          for (i = k1; i >= k0; i--) if (i || !k0) poly.push(B.pts[i]);
          if (k0 && w.mids[k0]) poly.push(w.mids[k0][j]);
        }
        out.push(poly);
      }
    }
    return out;
  }

  function impact(x, y, size) {                              // soft white bloom at the hit point
    var f = OwnIt.el('div', { 'aria-hidden': 'true' });
    var st = f.style;
    st.position = 'absolute'; st.left = (x - size) + 'px'; st.top = (y - size) + 'px'; st.width = size * 2 + 'px'; st.height = size * 2 + 'px';
    st.borderRadius = '50%'; st.background = 'radial-gradient(circle,rgba(255,255,255,.75),rgba(255,255,255,0) 65%)'; st.pointerEvents = 'none';
    ensureStage().shards.appendChild(f);
    an(f, [{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(1)', opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' });
  }

  function setWhat(text) { if (row && row.what) row.what.textContent = text; }

  function crackAt(k, x, y) {
    sound('crackStage', k);
    if (k === 1) {
      impact(x, y, 70); web.rays.forEach(function (r, i) { grow(r.c, 0.14 + Math.random() * 0.06, 260, i * 8); }); shake(360, 6); flick(0.12, 120);
    }
    if (k === 2) {
      impact(x, y, 110); web.rays.forEach(function (r, i) { grow(r.c, 0.45 + Math.random() * 0.1, 420, i * 12); });
      web.rings.forEach(function (g, i) { if (g.ri < 2) grow(g.c, 1, 300, 140 + g.ri * 160 + i * 6); }); shake(500, 12); flick(0.2, 150);
    }
    if (k === 3) {
      impact(x, y, 160); sound('rumble', { s: 0.9 }); web.rays.forEach(function (r, i) { grow(r.c, 1, 620, i * 10); });
      web.rings.forEach(function (g, i) { if (g.ri === 2) grow(g.c, 1, 320, 260 + i * 5); });
      web.branches.forEach(function (b, i) { grow(b, 1, 340, 220 + i * 9); }); shake(650, 18); flick(0.28, 170);
      if (pending) an(pending.dlg, [{ filter: 'none' }, { filter: 'brightness(1.25) contrast(1.1)', offset: 0.15 }, { filter: 'brightness(.9)' }], { duration: 600, easing: 'ease-out' });
    }
  }

  // ---------------------------------------------------------------- 3. the shards (one canvas, one bitmap of the dialog)

  function clipToRect(poly, r) {                             // Sutherland-Hodgman: keep only the part of a shard on the dialog
    [[0, r.left, 1], [0, r.right, -1], [1, r.top, 1], [1, r.bottom, -1]].forEach(function (e) {
      var out = [], k = e[0], v = e[1], s = e[2];
      poly.forEach(function (a, i) {
        var b = poly[(i + 1) % poly.length], ina = (a[k] - v) * s >= 0, inb = (b[k] - v) * s >= 0;
        if (ina) out.push(a);
        if (ina !== inb) { var t = (v - a[k]) / (b[k] - a[k]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      });
      poly = out;
    });
    return poly;
  }

  function buildShards(r, rad) {                             // geometry and physics now; the bitmap comes later (snapShards)
    var dpr = Math.min(window.devicePixelRatio || 1, 2), W = window.innerWidth, H = window.innerHeight;
    var cv = document.createElement('canvas');
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.position = 'absolute'; cv.style.left = '0px'; cv.style.top = '0px'; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ensureStage().shards.appendChild(cv);
    var hx = W / 2, hy = H / 2, list = [], dust = [];        // hit point = where the title lands
    function motion(cx, cy, kick, spin) {
      var dx = cx - hx, dy = cy - hy, d = Math.hypot(dx, dy) || 1;
      return { cx: cx, cy: cy, vx: dx / d * kick, vy: dy / d * kick * 0.6 - (40 + Math.random() * 110), vz: -(150 + Math.random() * 350),
        wz: (Math.random() - 0.5) * spin, wx: (Math.random() - 0.5) * spin * 1.4, wy: (Math.random() - 0.5) * spin * 1.4 };
    }
    cells(web).forEach(function (poly) {
      poly = clipToRect(poly, r);
      if (poly.length < 3) return;
      var cx = 0, cy = 0, area = 0;
      poly.forEach(function (p, i) { var q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; cx += p[0] / poly.length; cy += p[1] / poly.length; });
      if (Math.abs(area) < 40) return;
      var m = motion(cx, cy, 90 + Math.random() * 160, 260); m.poly = poly; m.delay = Math.min(140, Math.hypot(cx - hx, cy - hy) * 0.25) + Math.random() * 50;
      list.push(m);
    });
    for (var i = 0; i < 46; i++) {                           // glitter: tiny splinters thrown off the break
      var gx = r.left + Math.random() * r.w, gy = r.top + Math.random() * r.h, m2 = motion(gx, gy, 260 + Math.random() * 420, 900);
      m2.sz = 2 + Math.random() * 5; m2.a = 0.5 + Math.random() * 0.4; m2.delay = Math.random() * 60; dust.push(m2);
    }
    return { cv: cv, ctx: cv.getContext ? cv.getContext('2d') : null, dpr: dpr, r: r, rad: rad, list: list, dust: dust, img: null, loader: null, alive: true };
  }

  // The dialog is rasterised once through an SVG foreignObject (its styles inlined), then flattened to a bitmap.
  function pageCss() {
    var out = '';
    Array.prototype.forEach.call(document.styleSheets || [], function (sh) {
      try { Array.prototype.forEach.call(sh.cssRules || [], function (rule) { out += rule.cssText + '\n'; }); } catch (e) { /* a cross-origin sheet is unreadable */ }
    });
    return out;
  }
  function snapShards(sh, dlg) {
    var Img = window.Image, Ser = window.XMLSerializer;
    if (typeof Img !== 'function' || typeof Ser !== 'function' || !dlg || !dlg.cloneNode) return;
    var r = sh.r, c = dlg.cloneNode(true);
    c.removeAttribute('id');
    if (c.querySelectorAll) Array.prototype.forEach.call(c.querySelectorAll('[id]'), function (e) { e.removeAttribute('id'); });
    c.setAttribute('style', 'position:absolute;left:0;top:0;transform:none;margin:0;animation:none;max-height:none;overflow:visible;width:' + r.w + 'px;-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(38,39,44,.96)');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + r.w * sh.dpr + '" height="' + r.h * sh.dpr + '" viewBox="0 0 ' + r.w + ' ' + r.h + '">' +
      '<foreignObject width="' + r.w + '" height="' + r.h + '"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:' + r.w + 'px;height:' + r.h + 'px;color:#F5F3EE;font:400 15px/1.5 system-ui,sans-serif">' +
      '<style><![CDATA[' + pageCss() + ']]></style>' + new Ser().serializeToString(c) + '</div></foreignObject></svg>';
    var img = new Img();
    sh.loader = img;
    img.onload = function () {                               // flatten to a plain bitmap once; drawing an SVG image re-renders it every call
      var bm = document.createElement('canvas');
      bm.width = r.w * sh.dpr; bm.height = r.h * sh.dpr;
      try { bm.getContext('2d').drawImage(img, 0, 0, bm.width, bm.height); if (sh.alive) sh.img = bm; } catch (e) { /* the placeholder fill stays */ }
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function roundRect(ctx, x, y, w, h, rad) {
    ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath();
  }
  function onBorder(a, b, r) {                               // the edge lies on the dialog's outer rectangle (made by clipToRect)
    var e = 0.5;
    return (Math.abs(a[0] - r.left) < e && Math.abs(b[0] - r.left) < e) || (Math.abs(a[0] - r.right) < e && Math.abs(b[0] - r.right) < e) ||
      (Math.abs(a[1] - r.top) < e && Math.abs(b[1] - r.top) < e) || (Math.abs(a[1] - r.bottom) < e && Math.abs(b[1] - r.bottom) < e);
  }

  function drawShards(sh, ms) {                              // ms since impact; the physics is projected by hand
    var ctx = sh.ctx, r = sh.r, W = window.innerWidth, H = window.innerHeight, hx = W / 2, hy = H / 2, D = Math.PI / 180;
    ctx.setTransform(sh.dpr, 0, 0, sh.dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    function place(p) {
      var t = Math.max(0, ms - p.delay) / 1000, z = p.vz * t, s = PERSP / (PERSP - z);
      var x = hx + (p.cx + p.vx * t - hx) * s, y = hy + (p.cy + p.vy * t + 0.5 * G * t * t - hy) * s;
      ctx.globalAlpha = t < FALL * 0.75 ? 1 : Math.max(0, 1 - (t - FALL * 0.75) / (FALL * 0.25));
      ctx.translate(x, y); ctx.rotate(p.wz * t * D); ctx.scale(s * Math.cos(p.wy * t * D), s * Math.cos(p.wx * t * D)); ctx.translate(-p.cx, -p.cy);
      return t;
    }
    var flash = ms < 260 ? 0.5 * (1 - ms / 260) : 0;
    sh.list.forEach(function (p) {
      ctx.save(); place(p);
      // clip to the dialog's rounded outline first, then to the shard, so corner pieces keep the radius
      ctx.beginPath(); roundRect(ctx, r.left, r.top, r.w, r.h, sh.rad); ctx.clip();
      ctx.beginPath(); p.poly.forEach(function (q, i) { if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.clip();
      if (sh.img) ctx.drawImage(sh.img, r.left, r.top, r.w, r.h); else { ctx.fillStyle = 'rgba(38,39,44,.96)'; ctx.fillRect(r.left, r.top, r.w, r.h); }
      if (flash) { ctx.fillStyle = 'rgba(255,255,255,' + flash + ')'; ctx.fillRect(r.left, r.top, r.w, r.h); }
      // a bright edge only along the break lines; the dialog's own border already lives in the bitmap
      ctx.beginPath();
      p.poly.forEach(function (a, i) {
        var b = p.poly[(i + 1) % p.poly.length];
        if (onBorder(a, b, r)) return;
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      });
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    });
    sh.dust.forEach(function (p) {
      ctx.save(); place(p); ctx.globalAlpha *= p.a; ctx.fillStyle = '#F5F3EE';
      ctx.beginPath(); ctx.moveTo(p.cx, p.cy); ctx.lineTo(p.cx + p.sz, p.cy + p.sz * 0.3); ctx.lineTo(p.cx + p.sz * 0.4, p.cy + p.sz); ctx.fill();
      ctx.restore();
    });
  }

  // Reads the title animation's own clock, so the break lands on the very frame the title does.
  function playShards(sh, anim) {
    if (!sh.ctx) return;
    var t0 = perf();
    (function tick() {
      if (!sh.alive || !sh.cv.parentNode) return;            // reset removed the canvas
      var ms;
      if (anim && anim.startTime != null && document.timeline && document.timeline.currentTime != null) ms = document.timeline.currentTime - anim.startTime - IMPACT;
      else ms = perf() - t0 - IMPACT;
      if (ms >= 0) drawShards(sh, ms);
      if (ms > FALL * 1000 + 250) { sh.ctx.setTransform(1, 0, 0, 1, 0, 0); sh.ctx.clearRect(0, 0, sh.cv.width, sh.cv.height); return; }
      frame(tick);
    })();
  }

  // ---------------------------------------------------------------- 4. shatter: three cracks, then BREAK IT

  function dialogRadius(el) {
    try { return parseFloat(window.getComputedStyle(el).borderTopLeftRadius) || 22; } catch (e) { return 22; }
  }

  // The old, animation-free break: crack lines flash and the dialog fades. Used without the Web Animations API.
  function plainShatter(el, x, y, done) {
    var rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    var px = typeof x === 'number' ? x : rect.left + rect.width / 2, py = typeof y === 'number' ? y : rect.top + rect.height / 2;
    sound('glass');
    var cracks = OwnIt.el('div', { 'class': 'secret-veil secret-cracks', 'aria-hidden': 'true' });
    for (var i = 0; i < 9; i++) {
      var ln = OwnIt.el('span', { 'class': 'secret-crack' });
      ln.style.left = px + 'px';
      ln.style.top = py + 'px';
      ln.style.transform = 'rotate(' + Math.round(i * 40 + Math.random() * 25) + 'deg)';
      ln.style.width = Math.round(140 + Math.random() * 260) + 'px';
      cracks.appendChild(ln);
    }
    document.body.appendChild(cracks);
    timer(function () { if (cracks.remove) cracks.remove(); }, 700);
    if (el && el.style) { el.style.transition = 'opacity 200ms'; el.style.opacity = '0'; }
    timer(function () { if (done) done(); }, 250);
  }

  /* One click: three cracks on their own (0, 650, 1350 ms), then BREAK IT zooms in and smashes the dialog (2050 ms).
     done runs once, when the player continues (a click, or by itself after a moment), as the round opens.
     Returns false when it did not start (already running). */
  function shatter(el, x, y, done) {
    if (breaking || entering) return false;
    if (!el || !animOK()) { plainShatter(el, x, y, done); return true; }
    breaking = true;
    pending = { dlg: el, done: done };
    watchRouter();
    var S = ensureStage();
    S.root.classList.add('hold');
    stopShakes();                                            // measure the dialog at rest, not mid-wobble
    var br = el.getBoundingClientRect();
    var r = { left: br.left, top: br.top, w: br.width, h: br.height, right: br.left + br.width, bottom: br.top + br.height };
    var rad = dialogRadius(el);
    if (typeof x !== 'number' || (!x && !y)) {               // keyboard activation: from the middle of the row
      var rb = (row && alive(row) ? row.el : el).getBoundingClientRect();
      x = rb.left + rb.width / 2; y = rb.top + rb.height / 2;
    }
    if (row && row.el) row.el.classList.remove('idle');
    web = buildWeb(x, y, r, rad);
    if (OwnIt.reduced()) { reducedBreak(el, S); return true; }
    pieces = buildShards(r, rad);                            // the heavy work now, while nothing is moving yet
    crackAt(1, x, y); setWhat('IT GAVE A LITTLE');
    later(function () { crackAt(2, x, y); setWhat('IT IS SPREADING'); }, 650);
    later(function () { crackAt(3, x, y); setWhat('BRACE'); }, 1350);
    later(function () { if (pieces) snapShards(pieces, el); }, 1400);   // a bitmap of the dialog as it looks right before the hit
    later(function () { titleSmash(el, S); }, 2050);
    return true;
  }

  // Reduced motion: the cracks appear at once, the dialog fades, the title fades in. No shake, no shards.
  function reducedBreak(el, S) {
    web.rays.concat(web.rings).forEach(function (r) { grow(r.c, 1, 1); });
    web.branches.forEach(function (b) { grow(b, 1, 1); });
    sound('glass');
    an(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 300, fill: 'forwards' });
    an(S.svg, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 300, fill: 'forwards' });
    an(S.dark, [{ opacity: 0 }, { opacity: 0.92 }], { duration: 300, delay: 600, fill: 'forwards' });
    later(function () {
      S.title.style.opacity = '1'; S.tSub.style.opacity = '1';
      flipTiles(S.tiles, 'BREAK IT', 600);
      goLive(S);
    }, 900);
  }

  // The title is clickable (and focusable); with no click it carries on by itself.
  function goLive(S) {
    S.title.classList.add('live');
    S.title.setAttribute('role', 'button');
    S.title.setAttribute('tabindex', '0');
    S.title.setAttribute('aria-label', 'Break it. Continue.');
    if (S.title.focus) { try { S.title.focus(); } catch (e) { /* not focusable here */ } }
    an(S.tHint, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: 'ease-out', fill: 'forwards' });
    later(outro, AUTO_CONTINUE);
  }

  // BREAK IT rushes in over the cracked dialog; its landing is the blow.
  function titleSmash(el, S) {
    var sh = pieces, hit = IMPACT / 1000;
    S.tiles.forEach(function (t) { t.textContent = ' '; });
    sound('whoosh'); sound('glass', { at: hit }); sound('rumble', { s: 1.3, at: hit }); sound('crackle', { n: 10, g: 0.06, at: hit });   // booked on the audio clock, not a timer
    // All of these start in this one task and share one start time, so nothing drifts from the title landing.
    var hide = [{ opacity: 1 }, { opacity: 1, offset: 0.999 }, { opacity: 0 }];
    var zoom = an(S.title, [
      { opacity: 0, transform: 'scale(3.4)', filter: 'blur(14px)' },
      { opacity: 0.85, transform: 'scale(1.6)', filter: 'blur(5px)', offset: 0.5 },
      { opacity: 1, transform: 'scale(.95)', filter: 'blur(0)', offset: 0.82 },
      { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }
    ], { duration: 690, easing: 'cubic-bezier(.55,0,.25,1)', fill: 'forwards' });
    an(el, hide, { duration: IMPACT, fill: 'forwards' });
    an(S.svg, hide, { duration: IMPACT, fill: 'forwards' });
    shake(700, 24, IMPACT); flick(0.4, 170, IMPACT);
    playShards(sh, zoom);
    flipTiles(S.tiles, 'BREAK IT', 1000);
    later(function () { an(S.dark, [{ opacity: 0 }, { opacity: 0.92 }], { duration: 900, easing: 'ease-in-out', fill: 'forwards' }); }, 1100);
    later(function () { an(S.tSub, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'ease-out', fill: 'forwards' }); }, 1500);
    later(function () { goLive(S); }, 2200);
  }

  // Pull back, then the title rushes past the camera. The round opens underneath as the darkness lifts.
  function outro() {
    if (!stage || outroing || !stage.title.classList.contains('live')) return;
    var S = stage, cb = pending && pending.done;
    outroing = true;
    S.title.classList.remove('live');
    S.title.removeAttribute('tabindex');
    if (cb) { pending.done = null; try { cb(); } catch (e) { /* the round must not trap the cleanup */ } }
    if (OwnIt.reduced()) {
      an(S.title, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
      an(S.dark, [{ opacity: 0.92 }, { opacity: 0 }], { duration: 300, delay: 300, easing: 'ease-in-out', fill: 'forwards' });
      later(reset, 700);
      return;
    }
    sound('whooshOut');
    an(S.title, [
      { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
      { opacity: 1, transform: 'scale(.9)', filter: 'blur(0)', offset: 0.18 },
      { opacity: 0.8, transform: 'scale(1.8)', filter: 'blur(4px)', offset: 0.55 },
      { opacity: 0, transform: 'scale(5)', filter: 'blur(24px)' }
    ], { duration: 720, easing: 'cubic-bezier(.5,0,.8,.5)', fill: 'forwards' });
    an(S.tHint, [{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' });
    shake(500, 6); flick(0.14, 120);
    an(S.dark, [{ opacity: 0.92 }, { opacity: 0 }], { duration: 600, delay: 450, easing: 'ease-in-out', fill: 'forwards' });
    S.root.classList.remove('hold');
    later(reset, 1050);
  }

  // A brief darkness before the round (the old flow): the screen dims, then fn runs. Reduced motion shortens it to a flicker.
  function dark(fn) {
    veil(OwnIt.reduced() ? 'flicker' : 'dim', OwnIt.reduced() ? 300 : 1200);
    timer(function () { if (fn) fn(); }, OwnIt.reduced() ? 120 : 420);
  }

  // The break: a stronger scare and BROKEN scrambles onto the banner element.
  function broken(banner) {
    scare(true);
    scramble(banner, 'BROKEN', { frames: 14 });
  }

  /* The case report: what broke, why, where in the code, and the promise that nothing was edited.
     info: { text, why, ref }; revealed: true when the player gave up. Returns the panel. */
  function report(parent, info, revealed) {
    var box = OwnIt.el('section', { 'class': 'secret-report', 'aria-label': 'Case report' });
    box.appendChild(OwnIt.el('h3', { 'class': 'panel-title' }, revealed ? 'Case report: what Claude found' : 'Case report'));
    [['What broke', info.text], ['Why', info.why]].concat(info.fix ? [['How to fix', info.fix]] : []).forEach(function (p) {
      var rw = OwnIt.el('p', { 'class': 'secret-row' });
      rw.appendChild(OwnIt.el('strong', null, p[0] + ': '));
      rw.appendChild(OwnIt.el('span', null, String(p[1] || '')));
      box.appendChild(rw);
    });
    var refRow = OwnIt.el('p', { 'class': 'secret-row' });
    refRow.appendChild(OwnIt.el('strong', null, 'Where: '));
    refRow.appendChild(OwnIt.el('code', { 'class': 'ref' }, String(info.ref || '')));
    box.appendChild(refRow);
    box.appendChild(OwnIt.el('p', { 'class': 'note secret-note' }, NOTE));
    parent.appendChild(box);
    return box;
  }

  OwnIt.secret = {
    GAMES: GAMES, GIVE_UP_S: GIVE_UP_S, DOUBLE_MS: DOUBLE_MS, COOLDOWN: COOLDOWN, NOTE: NOTE, IMPACT: IMPACT,
    now: now, isAvailable: isAvailable, hintLabel: hintLabel, xp: xp, decode: decode, triggered: triggered,
    scare: scare, scramble: scramble, option: option, dark: dark, appear: appear, shatter: shatter, outro: outro, broken: broken, report: report,
    reset: reset,
    busy: function () { return { entering: entering, breaking: breaking, outroing: outroing }; },
    resetCooldown: function () { last = -1e9; }
  };
})();
