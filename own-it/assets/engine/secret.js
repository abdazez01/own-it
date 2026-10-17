/* own-it engine: the Secret level (OwnIt.secret). A hidden "break it" option in the level picker, the hover scare, the
   BROKEN reveal with its case report, and the decode of the obfuscated weakness. Quests is the first game to use it.
   The break only ever happens on a sandboxed screen copy with fake data; own-it never touches real code or systems.
   Effects respect prefers-reduced-motion (flicker only, no shake) and mute (sound goes through the audio engine). Load after gamekit.js. */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});

  var GAMES = ['quests'];                         // games that can offer the Secret level
  var HINTS = { role: 'Role', double: 'Timing', order: 'Order', input: 'Input' };
  var COOLDOWN = 3000, SHAKE_MS = 400, GIVE_UP_S = 180, DOUBLE_MS = 400;
  var NOTE = 'Claude will note this in chat. own-it never edits your code. Fix it after the session.';
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-:.';

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

  // ---------------------------------------------------------------- effects

  var last = -1e9;
  function veil(cls, ms) {
    var v = OwnIt.el('div', { 'class': 'secret-veil ' + cls, 'aria-hidden': 'true' });
    document.body.appendChild(v);
    timer(function () { if (v.remove) v.remove(); }, ms);
    return v;
  }

  function sound(name) { OwnIt.sound(name); }

  // The page shakes (not in reduced motion), flickers salmon and shows faint scanlines. Returns false while cooling down.
  function scare(strong) {
    var t = OwnIt.secret.now();
    if (!strong && t - last < COOLDOWN) return false;
    last = t;
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

  // Tiles scramble hard, then settle on text. Reduced motion: straight to the text.
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

  /* The picker row. Hidden until hovered or focused: "??????" flaps, then the tiles scramble and settle on SECRET.
     onChoose runs on click. The caller wires the radio behaviour (data-id, arrows) like the other level rows. */
  function option(onChoose) {
    var b = OwnIt.el('button', { type: 'button', role: 'radio', 'class': 'level-opt secret-opt', 'data-id': 'secret', 'aria-label': 'Secret level' });
    var tiles = OwnIt.el('span', { 'class': 'secret-tiles' });
    b.appendChild(tiles);
    b.appendChild(OwnIt.el('span', { 'class': 'level-desc secret-desc' }, 'Claude found a way to break your app. Find it.'));
    OwnIt.flap(tiles, '??????', { instant: true, variant: 'alert' });
    appear(b);
    var shown = false;
    function reveal() {
      if (shown) return;
      shown = true;
      b.classList.add('revealed');
      scare(false);
      scramble(tiles, 'SECRET');
    }
    function hide() {
      if (!shown) return;
      shown = false;
      b.classList.remove('revealed');
      scramble(tiles, '??????', { frames: 4 });
    }
    ['pointerenter', 'mouseenter', 'focus'].forEach(function (ev) { b.addEventListener(ev, reveal); });
    ['pointerleave', 'mouseleave', 'blur'].forEach(function (ev) { b.addEventListener(ev, hide); });
    if (onChoose) b.addEventListener('click', onChoose);
    return b;
  }

  // A short glitch entrance for the hidden option (skipped in reduced motion).
  function appear(el) {
    if (OwnIt.reduced() || !el) return el;
    el.classList.add('secret-appear');
    timer(function () { el.classList.remove('secret-appear'); }, 600);
    return el;
  }

  /* Shatters el (the glass dialog) from the point x,y: crack lines flash, then shards (clones of el, each clipped to a
     polygon) fly out, fall, spin and fade. done runs once it is over. Reduced motion: crack overlay and a quick fade. */
  function shatter(el, x, y, done) {
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
    var finish = function () { if (done) done(); };
    if (OwnIt.reduced() || !el || !el.cloneNode) {
      if (el && el.style) { el.style.transition = 'opacity 200ms'; el.style.opacity = '0'; }
      timer(finish, 250);
      return;
    }
    var cols = 4, rows = 3, shards = [];
    var w = rect.width || 1, h = rect.height || 1;
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      var x0 = c / cols * 100, x1 = (c + 1) / cols * 100, y0 = r / rows * 100, y1 = (r + 1) / rows * 100;
      var sh = el.cloneNode(true);
      sh.classList.add('secret-shard');
      sh.style.position = 'fixed';
      sh.style.left = rect.left + 'px';
      sh.style.top = rect.top + 'px';
      sh.style.width = w + 'px';
      sh.style.height = h + 'px';
      sh.style.margin = '0';
      sh.style.pointerEvents = 'none';
      sh.style.clipPath = 'polygon(' + x0 + '% ' + y0 + '%, ' + x1 + '% ' + (y0 + (r % 2 ? 6 : -4)) + '%, ' + x1 + '% ' + y1 + '%, ' + x0 + '% ' + (y1 + (c % 2 ? 5 : -3)) + '%)';
      document.body.appendChild(sh);
      shards.push({ node: sh, cx: (x0 + x1) / 2 / 100 * w + rect.left, cy: (y0 + y1) / 2 / 100 * h + rect.top });
    }
    el.style.visibility = 'hidden';
    timer(function () {
      shards.forEach(function (s) {
        var dx = s.cx - px, dy = s.cy - py, d = Math.sqrt(dx * dx + dy * dy) || 1;
        var out = 120 + Math.random() * 140;
        s.node.style.transition = 'transform 900ms cubic-bezier(.3,.1,.6,1), opacity 900ms ease-in';
        s.node.style.transform = 'translate(' + Math.round(dx / d * out) + 'px,' + Math.round(dy / d * out + 260 + Math.random() * 200) + 'px) rotate(' + Math.round((Math.random() - 0.5) * 120) + 'deg)';
        s.node.style.opacity = '0';
      });
    }, 40);
    timer(function () { shards.forEach(function (s) { if (s.node.remove) s.node.remove(); }); finish(); }, 1000);
  }

  // A brief darkness before the round: the screen dims, then fn runs. Reduced motion shortens it to a flicker.
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
    [['What broke', info.text], ['Why', info.why]].forEach(function (p) {
      var row = OwnIt.el('p', { 'class': 'secret-row' });
      row.appendChild(OwnIt.el('strong', null, p[0] + ': '));
      row.appendChild(OwnIt.el('span', null, String(p[1] || '')));
      box.appendChild(row);
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
    GAMES: GAMES, GIVE_UP_S: GIVE_UP_S, DOUBLE_MS: DOUBLE_MS, COOLDOWN: COOLDOWN, NOTE: NOTE,
    now: now, isAvailable: isAvailable, hintLabel: hintLabel, xp: xp, decode: decode, triggered: triggered,
    scare: scare, scramble: scramble, option: option, dark: dark, appear: appear, shatter: shatter, broken: broken, report: report,
    resetCooldown: function () { last = -1e9; }
  };
})();
