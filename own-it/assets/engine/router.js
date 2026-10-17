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

  function leave() {
    if (typeof cleanup === 'function') {
      try { cleanup(); } catch (e) { /* a game's cleanup must not trap the router */ }
    }
    cleanup = null;
    if (typeof state === 'object' && OwnIt.keys && OwnIt.keys.clearScope) OwnIt.keys.clearScope(state.game);
    if (OwnIt.keys && OwnIt.keys.setScope) OwnIt.keys.setScope('global');
  }

  // Round data files set window globals. Default lookup: window.OWNIT_ROUNDS['<game>-<roundId>'].
  function resolveRound(game, roundId) {
    var all = window.OWNIT_ROUNDS;
    var key = game + '-' + roundId;
    return all && Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
  }

  function notify() { listeners.forEach(function (f) { f(state); }); }

  function go(target) {
    var mount = mountPoint();
    leave();
    mount.textContent = '';
    if (target === 'home' || target == null) {
      state = 'home';
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
    var root = OwnIt.el('div', { 'class': 'game-root', 'data-game': def.id });
    if (target.roundId != null) root.setAttribute('data-round', String(target.roundId));
    mount.appendChild(root);
    if (OwnIt.keys && OwnIt.keys.setScope) OwnIt.keys.setScope(def.id);
    var ctx = {
      game: def.id, roundId: target.roundId, root: root, router: OwnIt.router, link: OwnIt.link, toast: OwnIt.toast,
      keys: { on: function (key, fn) { return OwnIt.keys.on(key, fn, def.id); } },
      finish: function (payload) { return OwnIt.link ? OwnIt.link.send('result', payload) : false; }
    };
    var out = def.play(root, OwnIt.router.resolveRound(def.id, target.roundId), ctx);
    if (typeof out === 'function') cleanup = out;
    notify();
    return true;
  }

  OwnIt.router = {
    go: go,
    current: function () { return state; },
    onChange: function (fn) { listeners.push(fn); },
    resolveRound: resolveRound
  };
})();
