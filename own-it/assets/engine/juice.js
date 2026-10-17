/* own-it engine: press feel, ripple, confetti, shake, tilt, toast (frontend spec 5 press feel, 5.18, 5.20). */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});
  var juice = (OwnIt.juice = {});

  function closest(node, sel) {
    return node && node.closest ? node.closest(sel) : null;
  }

  juice.press = function (el, kind) {
    // The :active scale is CSS. Here: the sound, so Enter/Space and pointer presses match.
    OwnIt.sound('press', kind || el && el.getAttribute && el.getAttribute('data-sound') || 'button');
  };

  juice.ripple = function (el, x, y) {
    if (OwnIt.reduced()) return;
    var r = el.getBoundingClientRect();
    var size = Math.max(r.width, r.height) * 2 || 80;
    var dot = OwnIt.el('span', { 'class': 'ripple', 'aria-hidden': 'true' });
    dot.style.left = (x - r.left) + 'px';
    dot.style.top = (y - r.top) + 'px';
    dot.style.width = size + 'px';
    dot.style.height = size + 'px';
    el.appendChild(dot);
    setTimeout(function () { if (dot.remove) dot.remove(); }, 520);
  };

  juice.shake = function (el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    setTimeout(function () { el.classList.remove('shake'); }, 380);
  };

  juice.tilt = function (el) {
    // Fine pointers with hover only. On touch there is no tilt, and the card still taps normally.
    if (OwnIt.reduced() || !OwnIt.mq('(hover: hover) and (pointer: fine)')) return;
    var MAX = 4;
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = 'perspective(700px) translateY(-2px) rotateX(' + (-py * MAX * 2).toFixed(2) +
        'deg) rotateY(' + (px * MAX * 2).toFixed(2) + 'deg)';
    });
    el.addEventListener('pointerleave', function () { el.style.transform = ''; });
  };

  /* Confetti: one canvas at z 50, at most 140 particles, 1.6 s life. Reduced motion: a sage flash. */
  var COLORS = ['#E8C26A', '#8FD3A8', '#F5F3EE', '#5A7BA8'];
  var MAX_PARTICLES = 140;
  var LIFE = 1600;
  var parts = [];
  var canvas = null, g2 = null, running = false, last = 0;

  function frame(now) {
    if (!canvas) { running = false; return; }
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    var w = window.innerWidth, h = window.innerHeight;
    g2.clearRect(0, 0, w, h);
    parts = parts.filter(function (p) { return now - p.born < LIFE; });
    parts.forEach(function (p) {
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      var a = Math.max(0, 1 - (now - p.born) / LIFE);
      g2.save();
      g2.globalAlpha = a;
      g2.translate(p.x, p.y);
      g2.rotate(p.r);
      g2.fillStyle = p.c;
      if (p.flag) {
        g2.fillRect(-1, -p.s, 2, p.s * 2);
        g2.fillRect(1, -p.s, p.s, p.s * 0.9);
      } else {
        g2.fillRect(-p.s / 2, -p.s * 0.7, p.s, p.s * 1.4);
      }
      g2.restore();
    });
    if (parts.length) { window.requestAnimationFrame(frame); return; }
    running = false;
    if (canvas.remove) canvas.remove();
    canvas = null; g2 = null;
  }

  juice.confetti = function (originEl) {
    if (OwnIt.reduced()) {
      var flash = OwnIt.el('div', { 'aria-hidden': 'true' });
      flash.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:#8FD3A8;opacity:.14;z-index:' + OwnIt.z.confetti;
      document.body.appendChild(flash);
      setTimeout(function () { if (flash.remove) flash.remove(); }, 260);
      return;
    }
    var rect = originEl && originEl.getBoundingClientRect ? originEl.getBoundingClientRect() : null;
    var ox = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    var oy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    if (!canvas) {
      canvas = OwnIt.el('canvas', { 'aria-hidden': 'true' });
      canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:' + OwnIt.z.confetti;
      var d = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * d;
      canvas.height = window.innerHeight * d;
      g2 = canvas.getContext && canvas.getContext('2d');
      if (!g2) { canvas = null; return; }
      g2.setTransform(d, 0, 0, d, 0, 0);
      document.body.appendChild(canvas);
    }
    var now = window.performance && performance.now ? performance.now() : Date.now();
    var n = Math.min(70, MAX_PARTICLES - parts.length);
    for (var i = 0; i < n; i++) {
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      var sp = 260 + Math.random() * 380;
      parts.push({
        x: ox, y: oy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, s: 5 + Math.random() * 6,
        c: COLORS[Math.floor(Math.random() * COLORS.length)], flag: Math.random() < 0.25, born: now
      });
    }
    if (!running) { running = true; last = now; window.requestAnimationFrame(frame); }
  };

  /* Toast: bottom-center pill, 3.2 s. One persistent aria-live region, reused so announcements are reliable. */
  var toastEl = null, toastTimer = null;
  function region() {
    if (!toastEl) {
      toastEl = OwnIt.el('div', { 'class': 'toast', role: 'status', 'aria-live': 'polite' });
      toastEl.style.opacity = '0';
      toastEl.style.pointerEvents = 'none';
      document.body.appendChild(toastEl);
    } else if (!toastEl.parentNode) document.body.appendChild(toastEl);
    return toastEl;
  }
  OwnIt.toast = function (message, opts) {
    opts = opts || {};
    var node = region();
    clearTimeout(toastTimer);
    node.textContent = '';
    node.appendChild(OwnIt.el('span', null, message));
    (opts.actions || []).forEach(function (a) {
      var b = OwnIt.el('button', { type: 'button', 'class': 'btn btn-quiet' }, a.label);
      b.addEventListener('click', function () { a.run(); });
      node.appendChild(b);
    });
    node.style.opacity = '1';
    node.style.pointerEvents = 'auto';
    toastTimer = setTimeout(function () {
      node.textContent = '';
      node.style.opacity = '0';
      node.style.pointerEvents = 'none';
    }, opts.actions && opts.actions.length ? 9000 : 3200);
    return node;
  };
  // Create the region early so the first message is announced.
  if (document.body) region();
  else document.addEventListener('DOMContentLoaded', region);

  /* Global press feel for every button: ripple + sound on pointerdown, sound on Enter/Space. */
  function soundFor(btn) {
    if (btn.getAttribute('data-sound') === 'none') return false;
    if (closest(btn, '.toggle')) return false; // toggles play their own sound
    return true;
  }
  document.addEventListener('pointerdown', function (e) {
    var btn = closest(e.target, 'button');
    if (!btn || btn.disabled) return;
    juice.ripple(btn, e.clientX, e.clientY);
    if (soundFor(btn)) juice.press(btn);
  });
  document.addEventListener('keydown', function (e) {
    if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
    var btn = closest(e.target, 'button');
    if (!btn || btn.disabled) return;
    var r = btn.getBoundingClientRect();
    juice.ripple(btn, r.left + r.width / 2, r.top + r.height / 2);
    if (soundFor(btn)) juice.press(btn);
  });
})();
