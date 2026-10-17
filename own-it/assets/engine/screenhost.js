/* own-it engine: screen host (design spec 6.2 and 15, frontend spec 6.4). Shows a rebuilt app screen from window.OWNIT_SCREENS
   inside <iframe sandbox="allow-same-origin" srcdoc=...>. There is no allow-scripts, so the copy cannot run code, and the srcdoc
   starts with a CSP meta that blocks every request except inline styles and data: images. The screen HTML is never inserted into
   this document: it only travels as the srcdoc attribute value. We only reach in through iframe.contentDocument after load, to
   attach listeners, set tabindex, and add one hover-outline <style> built with textContent. Load after z.js. */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});

  var CSP = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; form-action \'none\'; base-uri \'none\'">';
  var DOCTYPE = '<!doctype html>'; // first, so the copy renders in standards mode
  var OUTLINE = '[data-ownit]{cursor:pointer}'
    + '[data-ownit]:hover,[data-ownit]:focus,[data-ownit-hl="1"]{outline:2px solid #E8C26A;outline-offset:2px;border-radius:4px}'
    + '[data-ownit-hl="bad"]{outline:2px solid #E8907C;outline-offset:2px;border-radius:4px}'
    + '[data-ownit-hl="ok"]{outline:3px solid #8FC9A0;outline-offset:2px;border-radius:4px}';
  var RELAY = ['r', 'R', 'q', 'Q', 'n', 'N', 'm', 'M', '?', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  var DEFAULT_W = 390, DEFAULT_H = 720;

  function lookup(id) {
    var all = window.OWNIT_SCREENS;
    return all && id != null && Object.prototype.hasOwnProperty.call(all, id) ? all[id] : null;
  }

  function nativelyFocusable(el) {
    var t = String(el.tagName || '').toLowerCase();
    return t === 'a' || t === 'button' || t === 'input' || t === 'select' || t === 'textarea';
  }

  /* OwnIt.screenhost.mount(container, screenId, opts) builds the framed iframe inside container.
     opts: { width, height, maxScale, blockPointer, reserve (px of window height kept for the rest of the page when enlarging on wide screens) }
     Returns { ok, iframe, frame, doc, ids(), onPick(cb), highlight(id, kind), clear(), move(dir), pickCurrent(), current(), destroy() } */
  function mount(container, screenId, opts) {
    opts = opts || {};
    var W = opts.width || DEFAULT_W, H = opts.height || DEFAULT_H;
    // Wide desktop windows may enlarge the screen copy (up to 1.5x), but never past the window height, so it stays in view without page scroll.
    var wideWin = typeof window !== 'undefined' && window.innerWidth >= 1600;
    var maxScale = opts.maxScale || (wideWin ? 1.5 : 1);
    var screen = lookup(screenId);
    var picks = [];
    var tagged = [];     // [{id, el}] in document order, filled on load
    var cursor = -1;
    var ready = false;
    var readyCbs = [];
    var want = null;     // a highlight asked for before the iframe finished loading
    var gone = false;
    var onResize = null, ro = null;

    var frame = OwnIt.el('div', { 'class': 'screen-frame' + (opts.blockPointer ? ' no-pointer' : '') });
    var vp = OwnIt.el('div', { 'class': 'screen-vp' });
    frame.appendChild(vp);

    var api = {
      ok: !!screen && typeof screen.html === 'string',
      frame: frame,
      iframe: null,
      get doc() { return api.iframe ? api.iframe.contentDocument || null : null; },
      isReady: function () { return ready; },
      has: function (id) { return tagged.some(function (t) { return t.id === id; }); },
      // cb runs once the iframe has loaded and its tagged elements are known (immediately if that already happened).
      onReady: function (cb) { if (typeof cb !== 'function') return; if (ready) cb(api); else readyCbs.push(cb); },
      ids: function () { return tagged.map(function (t) { return t.id; }); },
      onPick: function (cb) { if (typeof cb === 'function') picks.push(cb); },
      // Outlines one tagged element (and clears the others unless keep is true). Also moves the keyboard cursor to it.
      highlight: function (id, kind, keep) {
        if (!tagged.length) { want = { id: id, kind: kind }; return; }
        tagged.forEach(function (t, i) {
          if (t.id === id) { t.el.setAttribute('data-ownit-hl', kind || '1'); if (!keep) cursor = i; reveal(t.el); }
          else if (!keep && t.el.getAttribute('data-ownit-hl') !== null) t.el.removeAttribute('data-ownit-hl');
        });
      },
      clear: function () {
        want = null;
        tagged.forEach(function (t) { t.el.removeAttribute('data-ownit-hl'); });
        cursor = -1;
      },
      current: function () { return cursor >= 0 && tagged[cursor] ? tagged[cursor].id : null; },
      // Arrow-key style navigation between tagged elements. dir is 1 or -1. Returns the id now highlighted, or null.
      move: function (dir) {
        if (!tagged.length) return null;
        cursor = cursor < 0 ? (dir < 0 ? tagged.length - 1 : 0) : (cursor + (dir < 0 ? -1 : 1) + tagged.length) % tagged.length;
        api.highlight(tagged[cursor].id, '1');
        return tagged[cursor].id;
      },
      pickCurrent: function () {
        if (cursor < 0 || !tagged[cursor]) return false;
        emit(tagged[cursor]);
        return true;
      },
      destroy: function () {
        gone = true;
        picks.length = 0;
        if (onResize && window.removeEventListener) window.removeEventListener('resize', onResize);
        if (ro) { try { ro.disconnect(); } catch (e) { /* gone */ } }
        if (frame.remove) frame.remove();
      }
    };

    // Keeps the outlined element visible when the screen copy is taller than its frame.
    function reveal(el) {
      if (el && typeof el.scrollIntoView === 'function') { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* not scrollable */ } }
    }

    function emit(entry) {
      picks.slice().forEach(function (cb) { cb(entry.id, entry.el); });
    }

    function fit() {
      if (gone) return;
      var avail = container.clientWidth || (container.getBoundingClientRect && container.getBoundingClientRect().width) || W;
      var s = Math.min(maxScale, Math.max(0.2, avail / W));
      if (s > 1 && typeof window !== 'undefined' && window.innerHeight) s = Math.max(1, Math.min(s, (window.innerHeight - (opts.reserve || 350)) / H));
      vp.style.width = Math.round(W * s) + 'px';
      vp.style.height = Math.round(H * s) + 'px';
      if (api.iframe) api.iframe.style.transform = 'scale(' + s + ')';
    }

    if (!api.ok) {
      ready = true; // nothing will ever load: callers waiting on onReady fall back at once
      vp.style.width = '100%';
      vp.appendChild(OwnIt.el('p', { 'class': 'screen-missing' }, 'This screen copy is missing. Ask Claude to rebuild it.'));
      container.appendChild(frame);
      return api;
    }

    var iframe = OwnIt.el('iframe', {
      'class': 'screen-iframe',
      sandbox: 'allow-same-origin',          // deliberately no allow-scripts, allow-forms, allow-popups, allow-top-navigation
      title: 'Screen copy: ' + screenId,
      referrerpolicy: 'no-referrer'
    });
    if (opts.blockPointer) { iframe.setAttribute('tabindex', '-1'); iframe.setAttribute('inert', ''); }
    iframe.style.width = W + 'px';
    iframe.style.height = H + 'px';
    iframe.style.transformOrigin = '0 0';
    iframe.style.border = '0';
    api.iframe = iframe;
    vp.appendChild(iframe);
    container.appendChild(frame);
    fit();

    function onLoad() {
      if (gone) return;
      var doc = iframe.contentDocument;
      if (!doc) return;
      // The copy must not navigate or re-policy itself: drop any <base> and any meta http-equiv but our own (the first),
      // and cancel link follows and form submits in the capture phase, before any handler in the copy sees them.
      var metas = doc.querySelectorAll('meta[http-equiv], base');
      var keptCsp = false;
      Array.prototype.slice.call(metas).forEach(function (m) {
        if (String(m.tagName).toLowerCase() === 'meta' && !keptCsp) { keptCsp = true; return; }
        if (m.remove) m.remove();
      });
      doc.addEventListener('click', function (e) {
        var t = e && e.target;
        if (t && t.closest && t.closest('a[href], area[href], button[type=submit], input[type=submit]')) e.preventDefault();
      }, true);
      doc.addEventListener('submit', function (e) { e.preventDefault(); }, true);
      // Keys typed while focus is inside the copy never reach the host page, so hand the game keys over. Enter and Space on a
      // tagged element stay with the element handler below. The relayed event targets the host body so key ownership checks pass.
      doc.addEventListener('keydown', function (e) {
        if (!e || RELAY.indexOf(e.key) < 0 || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
        var tt = e.target && e.target.tagName ? String(e.target.tagName).toLowerCase() : '';
        if (e.key !== 'Escape' && (tt === 'input' || tt === 'textarea' || tt === 'select')) return;
        var k = OwnIt.keys;
        if (!k || typeof k.dispatch !== 'function') return;
        k.dispatch({ key: e.key, target: document.body, shiftKey: !!e.shiftKey, ctrlKey: false, metaKey: false, altKey: false,
          defaultPrevented: false, preventDefault: function () { if (e.preventDefault) e.preventDefault(); }, stopPropagation: function () {} });
      });
      var style = doc.createElement('style');
      style.textContent = OUTLINE;
      (doc.head || doc.documentElement).appendChild(style);
      var els = doc.querySelectorAll('[data-ownit]');
      tagged = [];
      for (var i = 0; i < els.length; i++) {
        (function (el) {
          var id = el.getAttribute('data-ownit');
          var entry = { id: id, el: el };
          tagged.push(entry);
          if (!nativelyFocusable(el)) { el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button'); }
          el.addEventListener('click', function (e) {
            if (e && e.preventDefault) e.preventDefault();
            if (e && e.stopPropagation) e.stopPropagation();
            cursor = tagged.indexOf(entry);
            emit(entry);
          });
          el.addEventListener('keydown', function (e) {
            if (!e || (e.key !== 'Enter' && e.key !== ' ')) return;
            e.preventDefault();
            e.stopPropagation();
            cursor = tagged.indexOf(entry);
            emit(entry);
          });
        })(els[i]);
      }
      ready = true;
      if (want) { var w = want; want = null; api.highlight(w.id, w.kind); }
    }
    iframe.addEventListener('load', function () {
      onLoad();
      readyCbs.splice(0).forEach(function (cb) { cb(api); });
    });
    // srcdoc last, so the load listener is already in place. The value is the CSP meta followed by the screen html.
    iframe.setAttribute('srcdoc', DOCTYPE + CSP + screen.html);

    if (window.addEventListener) { onResize = fit; window.addEventListener('resize', onResize); }
    if (typeof window.ResizeObserver === 'function') {
      try { ro = new window.ResizeObserver(fit); ro.observe(container); } catch (e) { ro = null; }
    }
    return api;
  }

  OwnIt.screenhost = { mount: mount, CSP: CSP };
})();
