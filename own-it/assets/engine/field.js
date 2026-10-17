/* own-it engine: the drifting split-flap tile field behind the glass (frontend spec 3). */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});

  var TOKENS = [['--gold', '#E8C26A'], ['--steel', '#5A7BA8'], ['--sage', '#8FD3A8'], ['--navy', '#3E5578']];
  var EXTRA = '#C9A24E';
  var SALMON = '#F08A7A';
  var GLYPHS = 'OI0123456789ABCDEFGHJKLMNPRSTUVWXYZ/';
  var INK = '#111214';

  var cv = null, g = null, W = 0, H = 0, tiles = [], colors = [];
  var raf = 0, last = 0, running = false, alert = false, reduced = false;

  function cssColor(name, fallback) {
    try {
      var v = window.getComputedStyle(document.documentElement).getPropertyValue(name);
      v = v && String(v).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  function readColors() {
    colors = TOKENS.map(function (t) { return cssColor(t[0], t[1]); });
    colors.push(EXTRA);
  }

  function wantedCount() { return Math.min(26, Math.round(W * H / 52000)); }

  function make() {
    var s = 40 + Math.random() * 90;
    return {
      x: Math.random() * W, y: Math.random() * H, s: s,
      vx: (Math.random() - 0.5) * 0.18, vy: -(0.08 + Math.random() * 0.22),
      r: (Math.random() - 0.5) * 0.5, vr: (Math.random() - 0.5) * 0.0012,
      c: colors[Math.floor(Math.random() * colors.length)], a: 0.18 + Math.random() * 0.22,
      ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
      flip: 0, swapped: false, next: 2000 + Math.random() * 9000 // flips every 2-11 s
    };
  }

  function resize() {
    if (!cv) return;
    var d = Math.min(window.devicePixelRatio || 1, 2); // render cost: dpr capped at 2
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * d); cv.height = Math.round(H * d);
    g.setTransform(d, 0, 0, d, 0, 0);
    var n = wantedCount();
    while (tiles.length < n) tiles.push(make());
    if (tiles.length > n) tiles.length = n;
    if (!running || reduced) draw();
  }

  function rr(x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function draw() {
    if (!g) return;
    g.clearRect(0, 0, W, H);
    for (var i = 0; i < tiles.length; i++) {
      var k = tiles[i], w = k.s * 0.72, h = k.s;
      var sy = k.flip > 0 ? Math.abs(Math.cos(k.flip * Math.PI)) : 1;
      g.save();
      g.translate(k.x, k.y); g.rotate(k.r); g.scale(1, Math.max(sy, 0.04));
      g.globalAlpha = k.a; g.fillStyle = alert ? SALMON : k.c;
      rr(-w / 2, -h / 2, w, h, w * 0.14); g.fill();
      g.globalAlpha = k.a * 0.9; g.fillStyle = INK; g.fillRect(-w / 2, -1, w, 2); // hinge line
      g.globalAlpha = Math.min(1, k.a * 2.2);
      g.font = '600 ' + Math.round(h * 0.55) + 'px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(k.ch, 0, h * 0.04);
      g.restore();
    }
  }

  function stepTiles(dt) {
    for (var i = 0; i < tiles.length; i++) {
      var k = tiles[i];
      k.x += k.vx * dt * 0.06; k.y += k.vy * dt * 0.06; k.r += k.vr * dt;
      if (k.y < -k.s) { k.y = H + k.s; k.x = Math.random() * W; }
      if (k.x < -k.s) k.x = W + k.s;
      if (k.x > W + k.s) k.x = -k.s;
      k.next -= dt;
      if (k.next <= 0 && k.flip === 0) { k.flip = 0.001; k.next = 2000 + Math.random() * 9000; }
      if (k.flip > 0) { // scaleY collapse, glyph swap, reopen over 420 ms
        k.flip += dt / 420;
        if (k.flip >= 0.5 && !k.swapped) { k.ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]; k.swapped = true; }
        if (k.flip >= 1) { k.flip = 0; k.swapped = false; }
      }
    }
  }

  function frame(now) {
    if (!running) return;
    var dt = Math.min(50, now - last); last = now;
    stepTiles(dt); draw();
    raf = window.requestAnimationFrame(frame);
  }

  function loop() {
    if (running || reduced || !cv) return;
    running = true;
    last = (window.performance && window.performance.now) ? window.performance.now() : Date.now();
    raf = window.requestAnimationFrame(frame);
  }

  function halt() {
    running = false;
    if (raf && window.cancelAnimationFrame) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  function onVisibility() {
    if (!cv) return;
    if (document.hidden) halt(); else loop();
  }

  OwnIt.field = {
    start: function (canvas) {
      if (cv) OwnIt.field.stop();
      try {
        g = canvas.getContext('2d');
        if (!g) return;
        cv = canvas;
        cv.setAttribute('aria-hidden', 'true');
        cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:' + (OwnIt.z ? OwnIt.z.bg : 0);
        reduced = OwnIt.reduced ? OwnIt.reduced() : false;
        readColors();
        tiles = [];
        resize();
        window.addEventListener('resize', resize);
        document.addEventListener('visibilitychange', onVisibility);
        if (reduced) draw(); // reduced motion: one static frame
        else if (!document.hidden) loop();
      } catch (e) { cv = null; g = null; }
    },
    stop: function () {
      halt();
      try { window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVisibility); } catch (e) { /* ignore */ }
      cv = null; g = null; tiles = [];
    },
    // 3am Pager: tiles tint toward salmon while the alarm lasts.
    setAlert: function (on) { alert = !!on; if (cv && (!running || reduced)) draw(); },
    _count: function () { return tiles.length; }
  };
})();
