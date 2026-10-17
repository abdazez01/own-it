/* own-it engine: namespace, z-index scale (mirrors tokens.css 2.6) and shared helpers. Load first. */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});
  OwnIt.z = { bg: 0, content: 1, header: 10, side: 20, pop: 30, dialog: 40, confetti: 50, toast: 60 };

  function mq(q) {
    try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; }
  }
  OwnIt.reduced = function () { return mq('(prefers-reduced-motion: reduce)'); };
  OwnIt.mq = mq;

  // Audio arrives later (OwnIt.audio). Always call through this guard.
  OwnIt.sound = function (name, arg) {
    try { if (OwnIt.audio && OwnIt.audio.play) OwnIt.audio.play(name, arg); } catch (e) { /* sound never breaks UI */ }
  };

  // Build an element from a tag, attributes and text. Text goes through textContent only.
  OwnIt.el = function (tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  };
})();
