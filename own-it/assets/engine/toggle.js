/* own-it engine: liquid toggle / segmented control (frontend spec 5.3). Tap, click and arrow keys all work. */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});

  // One shared resize listener. A toggle that was attached and later detached is dropped from the registry.
  var registry = [];
  var listening = false;
  function attached(el) {
    if (typeof el.isConnected === 'boolean') return el.isConnected;
    for (var n = el; n; n = n.parentNode) if (n === document.documentElement) return true;
    return false;
  }
  function onResize() {
    registry = registry.filter(function (r) {
      var now = attached(r.el);
      if (now) r.seen = true;
      if (!now && r.seen) return false;
      r.place(false);
      return true;
    });
  }
  function track(el, place) {
    registry.push({ el: el, place: place, seen: false });
    if (!listening && window.addEventListener) { listening = true; window.addEventListener('resize', onResize); }
  }

  function toggle(el, options, value, onChange) {
    el.textContent = '';
    el.classList.add('toggle');
    el.setAttribute('role', 'radiogroup');
    var bubble = OwnIt.el('span', { 'class': 'toggle-bubble', 'aria-hidden': 'true' });
    el.appendChild(bubble);
    var current = value;
    if (!options.some(function (o) { return o.id === current; })) current = options.length ? options[0].id : null;
    var buttons = options.map(function (o) {
      var b = OwnIt.el('button', { type: 'button', role: 'radio', 'data-id': o.id }, o.label);
      el.appendChild(b);
      return b;
    });

    function place(animate) {
      var on = null;
      buttons.forEach(function (b) { if (b.getAttribute('aria-checked') === 'true') on = b; });
      if (!on) return;
      bubble.style.left = on.offsetLeft + 'px';
      bubble.style.width = on.offsetWidth + 'px';
      if (animate && !OwnIt.reduced()) {
        bubble.classList.remove('moving');
        void bubble.offsetWidth;
        bubble.classList.add('moving');
      }
    }
    function paint() {
      buttons.forEach(function (b, i) {
        var on = options[i].id === current;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.setAttribute('tabindex', on ? '0' : '-1');
      });
    }
    function choose(id, focus, silent) {
      if (id === current) { if (focus) buttons[indexOf(id)].focus(); return; }
      current = id;
      paint();
      place(true);
      if (focus) buttons[indexOf(id)].focus();
      if (!silent) OwnIt.sound('toggle');
      if (!silent && onChange) onChange(id);
    }
    function indexOf(id) {
      for (var i = 0; i < options.length; i++) if (options[i].id === id) return i;
      return -1;
    }

    buttons.forEach(function (b, i) {
      b.addEventListener('click', function () { choose(options[i].id, false); });
      b.addEventListener('keydown', function (e) {
        var d = 0;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') d = 1;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') d = -1;
        else if (e.key === 'Home') d = -i;
        else if (e.key === 'End') d = options.length - 1 - i;
        else return;
        e.preventDefault();
        var to = Math.max(0, Math.min(options.length - 1, i + d));
        choose(options[to].id, true);
      });
    });

    paint();
    var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 0); };
    raf(function () { place(false); });
    track(el, place);
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { place(false); }); } catch (e) { /* optional */ }

    return {
      get: function () { return current; },
      set: function (id) { if (indexOf(id) >= 0) choose(id, false, true); }
    };
  }

  OwnIt.toggle = toggle;
})();
