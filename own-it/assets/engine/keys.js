/* own-it engine: keyboard map (frontend spec 7) and the key help overlay with sound test (5.17). */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});
  var handlers = []; // {key, fn, scope}
  var scope = 'global';
  var helpEl = null, helpReturn = null;

  var GLOBAL_KEYS = [
    ['Tab', 'Move focus'], ['Enter', 'Activate'], ['Esc', 'Close dialog or leave game'],
    ['?', 'Key help and sound test'], ['M', 'Mute or unmute everything']
  ];

  var ALIAS = { esc: 'Escape', escape: 'Escape', space: ' ', spacebar: ' ', del: 'Delete', 'delete': 'Delete',
    left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
  function norm(k) {
    k = String(k);
    var a = ALIAS[k.toLowerCase()];
    if (a) return a;
    return k.length === 1 ? k.toLowerCase() : k;
  }

  function typing(t) {
    if (!t || !t.tagName) return false;
    var n = String(t.tagName).toLowerCase();
    return n === 'input' || n === 'textarea' || n === 'select' || (t.getAttribute && t.getAttribute('contenteditable') === 'true');
  }

  function dispatch(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !e.key || e.defaultPrevented) return;
    if (typing(e.target) && e.key !== 'Escape') return;
    var key = norm(e.key);
    // While the help dialog is open, game keys pause. Only close keys get through.
    if (helpEl && key !== 'Escape' && key !== '?') return;
    // The current game's handlers win over globals for the same key.
    var order = scope === 'global' ? ['global'] : [scope, 'global'];
    for (var s = 0; s < order.length; s++) {
      var hit = false;
      handlers.slice().forEach(function (h) {
        if (h.scope === order[s] && h.key === key) { hit = true; h.fn(e); }
      });
      if (hit) return;
    }
  }

  var keys = (OwnIt.keys = {
    on: function (key, fn, sc) {
      var h = { key: norm(key), fn: fn, scope: sc || 'global' };
      handlers.push(h);
      return function () { var i = handlers.indexOf(h); if (i >= 0) handlers.splice(i, 1); };
    },
    setScope: function (s) { scope = s || 'global'; },
    clearScope: function (s) { handlers = handlers.filter(function (h) { return h.scope !== s; }); },
    dispatch: dispatch,
    help: function () { if (helpEl) closeHelp(); else openHelp(); }
  });
  document.addEventListener('keydown', dispatch);

  function keyTile(label) {
    var row = OwnIt.el('span', { 'class': 'flap', 'aria-hidden': 'true' });
    Array.from(String(label)).forEach(function (ch) {
      row.appendChild(OwnIt.el('span', { 'class': 'flap-tile' }, ch.toUpperCase()));
    });
    return row;
  }

  function gameKeys() {
    var def = OwnIt.games && OwnIt.games.get(scope);
    var k = def && def.keys;
    if (!k) return [];
    if (Array.isArray(k)) {
      return k.map(function (x) {
        return Array.isArray(x) ? x : [x.key, x.action || x.label || x.desc || ''];
      });
    }
    return Object.keys(k).map(function (name) { return [name, k[name]]; });
  }

  function section(parent, title, rows) {
    if (!rows.length) return;
    parent.appendChild(OwnIt.el('h3', { 'class': 'panel-title' }, title));
    var list = OwnIt.el('div', { 'class': 'well' });
    rows.forEach(function (r) {
      var line = OwnIt.el('div', { 'class': 'help-row' });
      line.style.cssText = 'display:flex;align-items:center;gap:12px;padding:4px 0';
      line.appendChild(keyTile(r[0]));
      line.appendChild(OwnIt.el('span', null, r[1]));
      list.appendChild(line);
    });
    parent.appendChild(list);
  }

  function openHelp() {
    helpReturn = document.activeElement || null;
    var scrim = OwnIt.el('div', { 'class': 'scrim' });
    var dlg = OwnIt.el('div', { 'class': 'dialog glass-2', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ownit-help-title' });
    dlg.appendChild(OwnIt.el('h2', { id: 'ownit-help-title' }, 'Keyboard shortcuts'));
    section(dlg, 'Everywhere', GLOBAL_KEYS);
    section(dlg, 'In this game', gameKeys());

    dlg.appendChild(OwnIt.el('h3', { 'class': 'panel-title' }, 'Sound test'));
    var strip = OwnIt.el('div', { 'class': 'actions' });
    strip.style.justifyContent = 'flex-start';
    [['Flap', 'clack'], ['Correct', 'correct'], ['Wrong', 'wrong'], ['Level up', 'levelup']].forEach(function (p) {
      var b = OwnIt.el('button', { type: 'button', 'class': 'btn btn-secondary', 'data-sound': 'none' }, p[0]);
      b.addEventListener('click', function () { OwnIt.sound(p[1]); });
      strip.appendChild(b);
    });
    dlg.appendChild(strip);
    var vol = OwnIt.el('label', { 'class': 'flap-label' }, 'Volume');
    var now = 1;
    try { if (OwnIt.audio && OwnIt.audio.getVolume) now = Number(OwnIt.audio.getVolume()); } catch (e) { now = 1; }
    if (!(now >= 0 && now <= 1)) now = 1;
    var slider = OwnIt.el('input', { type: 'range', min: '0', max: '100', value: String(Math.round(now * 100)), 'aria-label': 'Volume' });
    slider.addEventListener('input', function () {
      try {
        if (OwnIt.audio && OwnIt.audio.setVolume) OwnIt.audio.setVolume(Number(slider.value) / 100);
      } catch (e) { /* ignore */ }
    });
    vol.appendChild(slider);
    dlg.appendChild(vol);

    var actions = OwnIt.el('div', { 'class': 'actions' });
    var close = OwnIt.el('button', { type: 'button', 'class': 'btn btn-primary' }, 'Close');
    close.addEventListener('click', closeHelp);
    actions.appendChild(close);
    dlg.appendChild(actions);

    scrim.appendChild(dlg);
    scrim.addEventListener('click', function (e) { if (e.target === scrim) closeHelp(); });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeHelp(); return; }
      if (e.key !== 'Tab') return;
      var f = dlg.querySelectorAll('button, input');
      if (!f.length) return;
      var first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    });
    document.body.appendChild(scrim);
    helpEl = scrim;
    close.focus();
  }

  function closeHelp() {
    if (!helpEl) return;
    if (helpEl.remove) helpEl.remove();
    helpEl = null;
    if (helpReturn && helpReturn.focus) helpReturn.focus();
    helpReturn = null;
  }

  // Global keys. M needs OwnIt.audio (Task 9) and is a no-op until it exists.
  keys.on('?', function () { keys.help(); }, 'global');
  keys.on('Escape', function () { closeHelp(); }, 'global');
  keys.on('m', function () {
    if (!OwnIt.audio || !OwnIt.audio.toggleMute) return;
    var muted = OwnIt.audio.toggleMute();
    if (OwnIt.toast) OwnIt.toast(muted ? 'Sound off' : 'Sound on');
  }, 'global');
})();
