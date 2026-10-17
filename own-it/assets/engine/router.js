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

  var offs = []; // unsubscribe fns for link listeners a game registered

  function leave() {
    if (typeof cleanup === 'function') {
      try { cleanup(); } catch (e) { /* a game's cleanup must not trap the router */ }
    }
    cleanup = null;
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

  function scopedLink() {
    if (!OwnIt.link) return null;
    var l = Object.create(OwnIt.link); // reads (mode, lost) and send fall through to the shared link
    ['onData', 'onMode'].forEach(function (name) {
      l[name] = function (cb) { var off = OwnIt.link[name](cb); offs.push(off); return off; };
    });
    return l;
  }

  function notify() { listeners.forEach(function (f) { f(state); }); }

  function fail() {
    leave();
    var mount = mountPoint();
    mount.textContent = '';
    state = 'home';
    if (typeof OwnIt.home === 'function') OwnIt.home(mount);
    if (OwnIt.toast) OwnIt.toast('Something went wrong with that game');
    notify();
    return false;
  }

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
      game: def.id, roundId: target.roundId, root: root, router: OwnIt.router, toast: OwnIt.toast,
      link: scopedLink(), feedback: OwnIt.feedback(target.roundId),
      keys: { on: function (key, fn) { return OwnIt.keys.on(key, fn, def.id); } },
      finish: function (payload) { return OwnIt.link ? OwnIt.link.send('result', payload) : false; }
    };
    try {
      var out = def.play(root, OwnIt.router.resolveRound(target.roundId), ctx);
      if (typeof out === 'function') cleanup = out;
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error(e);
      return fail();
    }
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
