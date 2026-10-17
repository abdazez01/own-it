/* own-it engine: the Home tour and the Practice versus Exam popover. Load after home.js and gamekit.js. It finds the parts of Home by
   selector, so home.js only calls OwnIt.tour.auto() after drawing and OwnIt.tour.modeInfo() for the switch. Builds DOM with OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});
  var active = null;

  // The real rules (grading.md): hints and the per-round debrief are Practice; Exam holds both back until the report card.
  var MODE_TEXT = {
    practice: 'Practice: hints are allowed (the cost depends on your level), Claude posts a debrief after each round, and asking why earns Curiosity XP.',
    exam: 'Exam: no hints and no debrief until the end, when you get a report card per zone: defensible, shaky or blind spot.',
    both: 'Rungs you pass count toward claiming a zone in both modes.'
  };

  function all(sel) { return Array.prototype.slice.call(document.body.querySelectorAll(sel)); }
  function one(sel) { return document.body.querySelector(sel); }
  function byLabel(test) { return all('button').filter(function (b) { return test(b.getAttribute('aria-label') || ''); }); }

  // One short sentence per step. A step whose part is not on the page (no recs yet, a collapsed menu) shows in the middle instead.
  function steps() {
    return [
      { title: 'Recommended', text: 'Start here: games picked for your app.', target: function () { return one('section[aria-labelledby=rec-h]'); } },
      { title: 'Departures', text: 'Each row is a zone. W M T B X are the rungs: Words, Map, Trace, Break, Boss. Clear all five to claim the zone.',
        target: function () { return one('section[aria-labelledby=dep-h]'); } },
      { title: 'Game library', text: 'Every game lives here. Use the filters to find one.', target: function () { return one('section[aria-labelledby=lib-h]'); } },
      { title: 'Practice or Exam', text: MODE_TEXT.practice + ' ' + MODE_TEXT.exam, target: function () { return one('[aria-label=Mode]'); }, onShow: openMenu },
      { title: 'XP and Claimed', text: 'XP is what you have earned. Claimed counts the zones you own.', target: function () { return all('.flap-label'); } },
      { title: 'Sound and music', text: 'Switch sound effects and music on or off here.', onShow: openMenu,
        target: function () { return byLabel(function (l) { return /^Turn (music|sound)/.test(l); }); } },
      { title: 'Help', text: 'Keyboard shortcuts live here, and so does Show me around if you want this tour again.', onShow: openMenu,
        target: function () { return byLabel(function (l) { return l === 'Keyboard help'; }); } }
    ];
  }

  // On narrow screens the tools sit behind the menu button: open it so the step has something to point at.
  function openMenu() {
    var head = all('header').filter(function (h) { return /home-head/.test(h.getAttribute('class') || ''); })[0];
    var btn = byLabel(function (l) { return l === 'Menu'; })[0];
    if (head && btn && head.getAttribute('data-open') !== 'true' && btn.offsetWidth !== 0) btn.click();
  }

  function start() {
    if (active || !OwnIt.kit || !OwnIt.kit.coach) return null;
    active = OwnIt.kit.coach(steps(), { float: true, label: 'Home tour', finishLabel: 'Done', onEnd: function () {
      active = null;
      OwnIt.kit.markSeen('home');
    } });
    return active;
  }

  // The "i" beside the Practice/Exam switch: always reachable, its text always in the page.
  function modeInfo() {
    var wrap = OwnIt.el('span', { 'class': 'mode-info' });
    var btn = OwnIt.el('button', { type: 'button', 'class': 'icon-btn mode-info-btn', 'aria-label': 'Practice versus Exam', 'aria-expanded': 'false' }, 'i');
    var pop = OwnIt.el('div', { 'class': 'mode-pop glass-2', role: 'note', hidden: 'hidden' });
    pop.appendChild(OwnIt.el('p', null, MODE_TEXT.practice));
    pop.appendChild(OwnIt.el('p', null, MODE_TEXT.exam));
    pop.appendChild(OwnIt.el('p', null, MODE_TEXT.both));
    function show(open) {
      if (open) pop.removeAttribute('hidden'); else pop.setAttribute('hidden', 'hidden');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function () { show(pop.hasAttribute('hidden')); });
    wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hasAttribute('hidden')) { e.stopPropagation(); show(false); btn.focus(); } });
    wrap.appendChild(btn);
    wrap.appendChild(pop);
    return wrap;
  }

  OwnIt.tour = {
    steps: steps,
    start: start,
    // Runs the tour the first time Home is drawn.
    auto: function () { if (OwnIt.kit && !OwnIt.kit.tutorialSeen('home') && !OwnIt.kit.modalOpen()) start(); },
    modeInfo: modeInfo,
    modeText: MODE_TEXT
  };
})();
