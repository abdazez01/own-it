/* own-it engine: live link client (parent spec 5b-2) with a file:// fallback.
   Live: GET /state?t= polled every 2 s, POST /event?t= for pick/result/challenge/hint/ask.
   File: results download as own-it-<id>.json and a copy offer carries OWNIT:<base64>. */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});
  var POLL_MS = 2000;
  var MAX_FAILS = 3;

  var token = null;
  try {
    var m = /[?&]t=([^&#]+)/.exec((window.location && window.location.search) || '');
    token = m ? decodeURIComponent(m[1]) : null;
  } catch (e) { token = null; }

  var known = null;      // last seen version map
  var fails = 0;
  var timer = null;
  var subs = [];
  var modeSubs = [];
  var lostEl = null;

  function q(path) { return path + '?t=' + encodeURIComponent(token); }

  function setMode(m) {
    if (link.mode === m) return;
    link.mode = m;
    try { document.documentElement.setAttribute('data-link', m); } catch (e) { /* optional */ }
    modeSubs.forEach(function (f) { f(m); });
  }

  function getState() {
    return fetch(q('/state')).then(function (r) {
      if (!r.ok) throw new Error('state ' + r.status);
      return r.json();
    });
  }

  function toBase64(text) {
    var bytes = new TextEncoder().encode(text), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function inject(file, version) {
    return new Promise(function (resolve) {
      var old = document.querySelectorAll('script[data-ownit-src]');
      Array.prototype.forEach.call(old, function (s) { if (s.getAttribute('data-ownit-src') === file && s.remove) s.remove(); });
      var s = OwnIt.el('script', { src: file + '?v=' + version, 'data-ownit-src': file });
      s.addEventListener('load', function () { resolve(); });
      s.addEventListener('error', function () { resolve(); });
      document.head.appendChild(s);
    });
  }

  function onGood(body) {
    fails = 0;
    if (link.lost) hideLost();
    var versions = body && body.versions ? body.versions : {};
    if (known) {
      Object.keys(versions).forEach(function (file) {
        if (known[file] === versions[file]) return;
        known[file] = versions[file];
        inject(file, versions[file]).then(function () {
          subs.forEach(function (f) { f({ file: file, version: versions[file] }); });
        });
      });
    } else {
      known = Object.assign({}, versions);
    }
  }

  function poll() {
    return getState().then(onGood, function () {
      fails++;
      if (fails >= MAX_FAILS && !link.lost) showLost();
    });
  }

  function startPolling() { if (!timer && link.mode === 'live') timer = setInterval(poll, POLL_MS); }

  function showLost() {
    link.lost = true;
    var scrim = OwnIt.el('div', { 'class': 'scrim' });
    var dlg = OwnIt.el('div', { 'class': 'dialog glass-2', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'ownit-lost-title' });
    var title = OwnIt.el('h2', { id: 'ownit-lost-title' });
    if (OwnIt.flap) OwnIt.flap(title, 'LINK LOST', { variant: 'alert' }); else title.textContent = 'Link lost';
    dlg.appendChild(title);
    dlg.appendChild(OwnIt.el('p', null, "own-it can't reach Claude. Check that the chat is still open, then press Retry."));
    var actions = OwnIt.el('div', { 'class': 'actions' });
    var paste = OwnIt.el('button', { type: 'button', 'class': 'btn btn-secondary' }, 'Use copy and paste');
    var retry = OwnIt.el('button', { type: 'button', 'class': 'btn btn-primary' }, 'Retry');
    retry.addEventListener('click', function () { poll(); });
    paste.addEventListener('click', function () {
      if (timer) { clearInterval(timer); timer = null; }
      hideLost();
      setMode('file');
      if (OwnIt.toast) OwnIt.toast('Offline mode: answers download to your Downloads folder.');
    });
    actions.appendChild(paste);
    actions.appendChild(retry);
    dlg.appendChild(actions);
    scrim.appendChild(dlg);
    document.body.appendChild(scrim);
    lostEl = scrim;
    retry.focus();
  }

  function hideLost() {
    link.lost = false;
    fails = 0;
    if (lostEl && lostEl.remove) lostEl.remove();
    lostEl = null;
  }

  function offerFile(payload) {
    var text = JSON.stringify(payload);
    var id = payload && typeof payload.id === 'string' ? payload.id : 'result';
    try {
      var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      var a = OwnIt.el('a', { href: url, download: 'own-it-' + id + '.json' });
      document.body.appendChild(a);
      a.click();
      if (a.remove) a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) { /* the copy offer below still works */ }
    if (OwnIt.toast) {
      OwnIt.toast('Answer saved to Downloads. Tell Claude in the chat.', {
        actions: [{
          label: 'Copy answer',
          run: function () {
            var code = 'OWNIT:' + toBase64(text);
            var done = function () { OwnIt.toast('Copied'); };
            try { navigator.clipboard.writeText(code).then(done, function () { OwnIt.toast("Couldn't copy"); }); }
            catch (e) { OwnIt.toast("Couldn't copy"); }
          }
        }]
      });
    }
  }

  var link = (OwnIt.link = {
    mode: 'file',
    lost: false,
    token: token,
    ready: null,
    send: function (type, payload) {
      var body = Object.assign({ type: type }, payload || {});
      if (link.mode === 'live') {
        return fetch(q('/event'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        }).then(function (r) {
          if (!r.ok) throw new Error('event ' + r.status);
          return true;
        }, function () { throw new Error('unreachable'); }).catch(function () {
          if (OwnIt.toast) OwnIt.toast("Couldn't reach Claude. Try again.");
          return false;
        });
      }
      if (type === 'result') { offerFile(payload || {}); return Promise.resolve(true); }
      if (OwnIt.toast) OwnIt.toast('Offline mode: ask Claude in the chat instead.');
      return Promise.resolve(false);
    },
    onData: function (cb) {
      subs.push(cb);
      link.ready.then(startPolling);
    },
    onMode: function (cb) { modeSubs.push(cb); },
    poll: poll
  });

  link.ready = !token ? Promise.resolve('file') : getState().then(function (body) {
    setMode('live');
    onGood(body);
    return 'live';
  }, function () { return 'file'; });
  try { document.documentElement.setAttribute('data-link', 'file'); } catch (e) { /* optional */ }
})();
