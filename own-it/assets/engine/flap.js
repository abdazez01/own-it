/* own-it engine: split-flap text (frontend spec 5.1). Real text is in aria-label; tiles are aria-hidden. */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});
  var CHARSET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-:.';
  var STEP_MS = 70;

  // Pure. 4 + index characters, the last one is the target (uppercased when it is a letter).
  function flapSteps(ch, index) {
    var target = String(ch).toUpperCase();
    var n = 4 + (index | 0);
    var at = CHARSET.indexOf(target);
    var out = [];
    for (var k = 0; k < n - 1; k++) out.push(CHARSET.charAt(((at < 0 ? 0 : at) + (k + 1) * 7 + 5) % CHARSET.length));
    out.push(target);
    return out;
  }

  function flap(el, text, opts) {
    opts = opts || {};
    var str = String(text);
    if (el.__flapTimers) el.__flapTimers.forEach(clearInterval);
    el.__flapTimers = [];
    el.textContent = '';
    el.classList.add('flap');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', str);
    var tiles = [];
    Array.from(str).forEach(function (ch, i) {
      var tile = OwnIt.el('span', { 'class': 'flap-tile', 'aria-hidden': 'true' });
      if (ch === '/' || (opts.accent && opts.accent.indexOf(ch) >= 0)) tile.classList.add('accent');
      else if (opts.variant === 'ok') tile.classList.add('ok');
      else if (opts.variant === 'alert') tile.classList.add('alert');
      var steps = flapSteps(ch, i);
      var still = OwnIt.reduced() || opts.instant;
      var final = steps[steps.length - 1];
      tile.textContent = still ? final : ' ';
      el.appendChild(tile);
      tiles.push({ tile: tile, steps: steps, i: i });
    });
    if (OwnIt.reduced() || opts.instant) return el;
    tiles.forEach(function (t) {
      var k = 0;
      var timer = setInterval(function () {
        t.tile.textContent = t.steps[k];
        t.tile.classList.remove('flip');
        void t.tile.offsetWidth;
        t.tile.classList.add('flip');
        // Only a flip the player caused clacks; the first tile stands for the whole row.
        if (opts.sound && t.i === 0) OwnIt.sound('clack');
        if (++k >= t.steps.length) { clearInterval(timer); }
      }, STEP_MS);
      el.__flapTimers.push(timer);
    });
    return el;
  }

  flap.flapSteps = flapSteps;
  flap.CHARSET = CHARSET;
  OwnIt.flap = flap;
  OwnIt.flapSteps = flapSteps;
})();
