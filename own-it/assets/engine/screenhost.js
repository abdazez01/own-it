/* own-it engine: screen host (design spec 6.2 and 15, frontend spec 6.4). Shows a rebuilt app screen from window.OWNIT_SCREENS
   inside <iframe sandbox="allow-same-origin" srcdoc=...>. There is no allow-scripts, so the copy cannot run code, and the srcdoc
   starts with a CSP meta that blocks every request except inline styles and data: images. The screen HTML is never inserted into
   this document: it only travels as the srcdoc attribute value. We only reach in through iframe.contentDocument after load, to
   attach listeners, set tabindex, and add one hover-outline <style> built with textContent. Load after z.js. */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});

  var CSP = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">';
  var OUTLINE = '[data-ownit]{cursor:pointer}'
    + '[data-ownit]:hover,[data-ownit]:focus,[data-ownit-hl="1"]{outline:2px solid #E8C26A;outline-offset:2px;border-radius:4px}'
    + '[data-ownit-hl="bad"]{outline:2px solid #E8907C;outline-offset:2px;border-radius:4px}'
    + '[data-ownit-hl="ok"]{outline:3px solid #8FC9A0;outline-offset:2px;border-radius:4px}';
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
     opts: { width, height, maxScale, blockPointer }
     Returns { ok, iframe, frame, doc, ids(), onPick(cb), highlight(id, kind), clear(), move(dir), pickCurrent(), current(), destroy() } */
  function mount(container, screenId, opts) {
    opts = opts || {};
    var W = opts.width || DEFAULT_W, H = opts.height || DEFAULT_H;
    var maxScale = opts.maxScale || 1;
    var screen = lookup(screenId);
    var picks = [];
    var tagged = [];     // [{id, el}] in document order, filled on load
    var cursor = -1;
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
      ids: function () { return tagged.map(function (t) { return t.id; }); },
      onPick: function (cb) { if (typeof cb === 'function') picks.push(cb); },
      // Outlines one tagged element (and clears the others unless keep is true). Also moves the keyboard cursor to it.
      highlight: function (id, kind, keep) {
        if (!tagged.length) { want = { id: id, kind: kind }; return; }
        tagged.forEach(function (t, i) {
          if (t.id === id) { t.el.setAttribute('data-ownit-hl', kind || '1'); if (!keep) cursor = i; }
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

    function emit(entry) {
      picks.slice().forEach(function (cb) { cb(entry.id, entry.el); });
    }

    function fit() {
      if (gone) return;
      var avail = container.clientWidth || (container.getBoundingClientRect && container.getBoundingClientRect().width) || W;
      var s = Math.min(maxScale, Math.max(0.2, avail / W));
      vp.style.width = Math.round(W * s) + 'px';
      vp.style.height = Math.round(H * s) + 'px';
      if (api.iframe) api.iframe.style.transform = 'scale(' + s + ')';
    }

    if (!api.ok) {
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
      if (want) { var w = want; want = null; api.highlight(w.id, w.kind); }
    }
    iframe.addEventListener('load', onLoad);
    // srcdoc last, so the load listener is already in place. The value is the CSP meta followed by the screen html.
    iframe.setAttribute('srcdoc', CSP + screen.html);

    if (window.addEventListener) { onResize = fit; window.addEventListener('resize', onResize); }
    if (typeof window.ResizeObserver === 'function') {
      try { ro = new window.ResizeObserver(fit); ro.observe(container); } catch (e) { ro = null; }
    }
    return api;
  }

  // Rounds name model items by id (or give plain sentences). Ids read better as words.
  function label(text) {
    var t = String(text == null ? '' : text);
    if (/\s/.test(t)) return t;
    var spaced = t.replace(/[-_.]+/g, ' ').trim();
    return spaced || t;
  }

  OwnIt.screenhost = { mount: mount, label: label, CSP: CSP };
})();
