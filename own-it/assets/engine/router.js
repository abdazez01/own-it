/* own-it engine: game registry and router. Games register themselves; the router mounts one at a time. */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});
  var games = (OwnIt.games = new Map());
  var state = 'home';
  var cleanup = null;
  var listeners = [];

  OwnIt.register = function (def) {
    if (!def || typeof def.id !== 'string' || !def.id) throw new Error('OwnIt.register: id is required');
    if (typeof def.play !== 'function') throw new Error('OwnIt.register: play(root, round, ctx) is required for ' + def.id);
    games.set(def.id, def);
    return def;
  };

  function mountPoint() {
    return (document.getElementById && document.getElementById('stage')) || document.body;
  }

  var panel = null; // the open feedback panel, if any
  var offs = []; // unsubscribe fns for link listeners a game registered

  function leave() {
    if (typeof cleanup === 'function') {
      try { cleanup(); } catch (e) { /* a game's cleanup must not trap the router */ }
    }
    cleanup = null;
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
    offs.splice(0).forEach(function (off) { try { off(); } catch (e) { /* already gone */ } });
    if (typeof state === 'object' && OwnIt.keys && OwnIt.keys.clearScope) OwnIt.keys.clearScope(state.game);
    if (OwnIt.keys && OwnIt.keys.setScope) OwnIt.keys.setScope('global');
  }

  // Round ids are '<zone>-<game>-<n>'. Data files register themselves: window.OWNIT_ROUNDS[roundId] = {...}.
  function lookup(table, id) {
    var all = window[table];
    return all && id != null && Object.prototype.hasOwnProperty.call(all, id) ? all[id] : null;
  }
  function resolveRound(roundId) { return lookup('OWNIT_ROUNDS', roundId); }
  OwnIt.feedback = function (roundId) { return lookup('OWNIT_FEEDBACK', roundId); };

  // Claude's debrief, slid in after the result card (frontend spec 5.14). Text only, never HTML.
  function showPanel(fb) {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = OwnIt.el('aside', { 'class': 'panel feedback-panel', 'aria-label': "Claude's debrief", role: 'complementary' });
    panel.appendChild(OwnIt.el('h3', { 'class': 'panel-title' }, "Claude's debrief"));
    panel.appendChild(OwnIt.el('p', { 'class': 'debrief' }, fb.debrief));
    if (fb.notes && typeof fb.notes === 'object') {
      var ul = OwnIt.el('ul', { 'class': 'notes' });
      Object.keys(fb.notes).forEach(function (k) { ul.appendChild(OwnIt.el('li', null, String(fb.notes[k]))); });
      panel.appendChild(ul);
    }
    var close = OwnIt.el('button', { type: 'button', 'class': 'btn' }, 'Close');
    close.addEventListener('click', function () { if (panel && panel.parentNode) panel.parentNode.removeChild(panel); panel = null; });
    panel.appendChild(close);
    document.body.appendChild(panel);
  }

  function scopedLink() {
    if (!OwnIt.link) return null;
    var l = Object.create(OwnIt.link); // reads (mode, lost) and send fall through to the shared link
    ['onData', 'onMode'].forEach(function (name) {
      l[name] = function (cb) { var off = OwnIt.link[name](cb); offs.push(off); return off; };
    });
    return l;
  }

  // The open game lives in the URL hash ('#/play/<game>/<round>') so a reload returns to it. replaceState keeps the ?t= token and adds no history.
  function writeHash(game, roundId) {
    try {
      var loc = window.location || {};
      var base = (loc.pathname || '') + (loc.search || '');
      var hash = game ? '#/play/' + encodeURIComponent(game) + '/' + encodeURIComponent(roundId) : '';
      if (window.history && typeof window.history.replaceState === 'function') window.history.replaceState(null, '', base + hash);
    } catch (e) { /* the hash is a convenience */ }
  }

  function restore() {
    var m = /^#\/play\/([^/]+)\/([^/]+)$/.exec((window.location && window.location.hash) || '');
    if (!m) return false;
    var game, id;
    try { game = decodeURIComponent(m[1]); id = decodeURIComponent(m[2]); } catch (e) { return false; }
    if (!games.has(game) || !resolveRound(id)) return false;
    return go({ game: game, roundId: id });
  }

  function notify() { listeners.forEach(function (f) { f(state); }); }

  function fail() {
    leave();
    var mount = mountPoint();
    mount.textContent = '';
    state = 'home';
    writeHash(null);
    if (typeof OwnIt.home === 'function') OwnIt.home(mount);
    if (OwnIt.toast) OwnIt.toast("This round can't be played. Ask Claude to rebuild it.");
    notify();
    return false;
  }

  function go(target) {
    var mount = mountPoint();
    leave();
    mount.textContent = '';
    if (target === 'home' || target == null) {
      state = 'home';
      writeHash(null);
      if (typeof OwnIt.home === 'function') OwnIt.home(mount);
      notify();
      return true;
    }
    var def = games.get(target.game);
    if (!def) {
      state = 'home';
      if (OwnIt.toast) OwnIt.toast('That game is not available yet');
      notify();
      return false;
    }
    state = { game: target.game, roundId: target.roundId };
    writeHash(target.roundId != null ? target.game : null, target.roundId);
    var root = OwnIt.el('div', { 'class': 'game-root', 'data-game': def.id });
    if (target.roundId != null) root.setAttribute('data-round', String(target.roundId));
    mount.appendChild(root);
    if (OwnIt.keys && OwnIt.keys.setScope) OwnIt.keys.setScope(def.id);
    var finished = false;
    var ctx = {
      game: def.id, roundId: target.roundId, root: root, router: OwnIt.router, toast: OwnIt.toast,
      link: scopedLink(), feedback: OwnIt.feedback(target.roundId),
      keys: { on: function (key, fn) { return OwnIt.keys.on(key, fn, def.id); } },
      finish: function (payload) {
        var sent = OwnIt.link ? OwnIt.link.send('result', payload) : false;
        if (!finished) {
          finished = true;
          var seen = null;
          var check = function () {
            var fb = OwnIt.feedback(target.roundId);
            if (fb && typeof fb.debrief === 'string' && fb.debrief && fb.debrief !== seen) { seen = fb.debrief; showPanel(fb); }
          };
          check();
          if (ctx.link && ctx.link.onData) ctx.link.onData(check);
        }
        return sent;
      }
    };
    try {
      var out = def.play(root, OwnIt.router.resolveRound(target.roundId), ctx);
      if (typeof out === 'function') cleanup = out;
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error(e);
      return fail();
    }
    if (OwnIt.autoHowTo) { try { OwnIt.autoHowTo(def.id); } catch (e) { /* the guide never blocks a game */ } }
    notify();
    return true;
  }

  OwnIt.router = {
    go: go,
    current: function () { return state; },
    onChange: function (fn) { listeners.push(fn); },
    resolveRound: resolveRound,
    restore: restore
  };
})();
