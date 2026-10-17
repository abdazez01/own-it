/* own-it engine: minimal line icons (stroke 2, 24 grid). Swap in Tabler later; keep the names. */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});
  var NS = 'http://www.w3.org/2000/svg';
  var PATHS = {
    sound: ['M4 9v6h4l5 4V5L8 9H4z', 'M16 9a4 4 0 0 1 0 6', 'M18.5 6.5a8 8 0 0 1 0 11'],
    music: ['M9 18V6l10-2v12', 'M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3z', 'M19 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z'],
    help: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7', 'M12 17h.01'],
    close: ['M6 6l12 12', 'M18 6L6 18'],
    check: ['M5 12.5l4.5 4.5L19 7.5'],
    arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
    lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
    flag: ['M6 21V4', 'M6 4h11l-2 4 2 4H6'],
    timer: ['M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M12 9v4l2.5 2', 'M9.5 2.5h5']
  };

  function make(tag) {
    return document.createElementNS ? document.createElementNS(NS, tag) : document.createElement(tag);
  }

  OwnIt.icons = {
    names: Object.keys(PATHS),
    svg: function (name) {
      var svg = make('svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '20');
      svg.setAttribute('height', '20');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      var list = Object.prototype.hasOwnProperty.call(PATHS, name) ? PATHS[name] : [];
      list.forEach(function (d) {
        var p = make('path');
        p.setAttribute('d', d);
        svg.appendChild(p);
      });
      return svg;
    }
  };
})();
