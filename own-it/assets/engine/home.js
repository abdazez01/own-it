/* own-it engine: Home / dashboard (frontend spec 6.1). Header, recommended row, departures board, game library, footer.
   Reads window.OWNIT_GAMES, OWNIT_PROGRESS, OWNIT_RECS, OWNIT_ROUNDS. Every one of them may be missing.
   Never builds markup from data: everything goes through OwnIt.el (textContent / setAttribute). */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});
  var RUNG_CHARS = [['words', 'W'], ['map', 'M'], ['trace', 'T'], ['break', 'B'], ['boss', 'X']];
  var FILTERS = [{ id: 'all', label: 'All' }, { id: 'app', label: 'Your app' }, { id: 'quick', label: 'Quick' }, { id: 'exam', label: 'Exam-ready' }];

  OwnIt.mode = OwnIt.mode || 'practice';
  var entered = false;         // the load sequence plays once per page load
  var building = {};           // 'game|zone' -> true after a pick was sent in live mode
  var selectedZone = null;
  var cleanupHome = null;

  // ---------------------------------------------------------------- data

  function own(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k); }
  function games() { return Array.isArray(window.OWNIT_GAMES) ? window.OWNIT_GAMES : []; }
  function progress() { var p = window.OWNIT_PROGRESS; return p && typeof p === 'object' ? p : null; }
  function recs() { return Array.isArray(window.OWNIT_RECS) ? window.OWNIT_RECS : []; }
  function metaOf(id) { var g = games(); for (var i = 0; i < g.length; i++) if (g[i] && g[i].id === id) return g[i]; return null; }
  function isBuilt(id) { return !!(OwnIt.games && OwnIt.games.has(id)); }

  function zones() {
    var p = progress();
    var zs = p && p.zones && typeof p.zones === 'object' ? p.zones : {};
    return Object.keys(zs).map(function (id) { return { id: id, z: zs[id] }; });
  }

  // First round id for '<zone>-<game>-<n>' in OWNIT_ROUNDS, or null.
  function roundFor(zone, game) {
    var all = window.OWNIT_ROUNDS;
    if (!all || typeof all !== 'object') return null;
    var prefix = zone + '-' + game + '-';
    var ids = Object.keys(all).filter(function (k) { return k.indexOf(prefix) === 0; }).sort();
    return ids.length ? ids[0] : null;
  }

  // 'ready' | 'building' | 'ask'
  function stateOf(game, zone) {
    if (roundFor(zone, game)) return 'ready';
    if (building[game + '|' + zone]) return 'building';
    return 'ask';
  }
  var STATE_LABEL = { ready: 'Ready', building: 'Building', ask: 'Ask Claude' };

  function boardingZone() {
    var zs = zones();
    for (var i = 0; i < zs.length; i++) if (!zs[i].z.claimed && !zs[i].z.fogged) return zs[i].id;
    for (var j = 0; j < zs.length; j++) if (!zs[j].z.claimed) return zs[j].id;
    return zs.length ? zs[0].id : null;
  }

  function zoneStatus(id, z) {
    if (z.claimed) return { text: 'ON TIME', cls: 'status-ok', variant: 'ok' };
    if (z.fogged) {
      var n = (z.fogFiles || z.changed || []).length;
      return { text: n ? 'FOG - ' + n + (n === 1 ? ' FILE' : ' FILES') : 'FOG', cls: 'status-fog', variant: 'alert' };
    }
    if (id === boardingZone()) return { text: 'BOARDING', cls: 'status-go', variant: null };
    return { text: 'SCHEDULED', cls: '', variant: null };
  }

  function nextText(z) {
    if (z.claimed) return 'Claimed';
    var rungs = z.rungs || {};
    for (var i = 0; i < RUNG_CHARS.length; i++) {
      if (rungs[RUNG_CHARS[i][0]] === 'open') {
        var names = games().filter(function (g) { return g.rung === RUNG_CHARS[i][0]; }).slice(0, 2).map(function (g) { return g.name; });
        return names.length ? names.join(', ') : 'Keep going';
      }
    }
    return 'Keep going';
  }

  // ---------------------------------------------------------------- actions

  function copyCommand(game, zone) {
    var cmd = 'play ' + game + ' ' + zone;
    var done = function () { OwnIt.toast('Copied. Paste it to Claude in the chat.'); };
    var fail = function () { OwnIt.toast("Couldn't copy. Type: " + cmd); };
    try {
      var p = window.navigator.clipboard.writeText(cmd);
      if (p && p.then) p.then(done, fail); else done();
    } catch (e) { fail(); }
    return cmd;
  }

  function pick(game, zone) {
    var meta = metaOf(game);
    if (!isBuilt(game)) { OwnIt.toast('That game is coming in a later update'); return; }
    if (!zone) { OwnIt.toast('No zones yet. Ask Claude to set up your zones.'); return; }
    var round = roundFor(zone, game);
    if (round) { OwnIt.router.go({ game: game, roundId: round }); return; }
    if (OwnIt.link && OwnIt.link.mode === 'live') {
      OwnIt.link.send('pick', { game: game, zone: zone, mode: OwnIt.mode });
      building[game + '|' + zone] = true;
      var mount = document.getElementById('stage') || document.body;
      cleanupHome = null;
      OwnIt.building(mount, {
        game: game, zone: zone, name: meta ? meta.name : game,
        isReady: function () { return !!roundFor(zone, game); },
        onReady: function () { OwnIt.router.go({ game: game, roundId: roundFor(zone, game) }); },
        onBack: function () { OwnIt.router.go('home'); },
        onCopy: function () { copyCommand(game, zone); }
      });
      return;
    }
    copyCommand(game, zone);
  }

  // ---------------------------------------------------------------- pieces

  function press(btn, kind) { btn.setAttribute('data-sound', kind); }

  function hoverSound(el) {
    el.addEventListener('pointerenter', function () {
      if (OwnIt.mq('(hover: hover) and (pointer: fine)')) OwnIt.sound('hover');
    });
  }

  function iconToggle(icon, label, on, onChange) {
    var b = OwnIt.el('button', { type: 'button', 'class': 'icon-btn', 'aria-pressed': on ? 'true' : 'false', 'data-sound': 'toggle' });
    b.appendChild(OwnIt.icons.svg(icon));
    function paint(v) {
      b.setAttribute('aria-pressed', v ? 'true' : 'false');
      b.setAttribute('aria-label', 'Turn ' + label + (v ? ' off' : ' on'));
    }
    paint(on);
    b.addEventListener('click', function () {
      var next = b.getAttribute('aria-pressed') !== 'true';
      paint(next);
      onChange(next);
    });
    return b;
  }

  function statBlock(label, hideSm) {
    var s = OwnIt.el('div', { 'class': 'flap-label' + (hideSm ? ' hide-sm' : '') });
    s.appendChild(OwnIt.el('span', null, label));
    var f = OwnIt.el('span');
    s.appendChild(f);
    return { box: s, flap: f };
  }

  function header() {
    var p = progress();
    var zs = zones();
    var claimed = zs.filter(function (z) { return z.z.claimed; }).length;
    var head = OwnIt.el('header', { 'class': 'header home-head rise' });
    var brand = OwnIt.el('div', { 'class': 'brand' });
    brand.appendChild(OwnIt.el('img', { src: 'brand/mark.svg', alt: '', width: "62", height: "40" }));
    brand.appendChild(OwnIt.el('span', { 'class': 'word' }, 'own-it'));
    head.appendChild(brand);
    head.appendChild(OwnIt.el('span', { 'class': 'grow' }));

    var xp = statBlock('XP');
    head.appendChild(xp.box);
    OwnIt.flap(xp.flap, String(Math.max(0, (p && p.xp) | 0)).padStart(5, '0'));
    var cl = statBlock('Claimed', true);
    head.appendChild(cl.box);
    OwnIt.flap(cl.flap, claimed + '/' + zs.length);

    var menu = OwnIt.el('button', { type: 'button', 'class': 'icon-btn menu-btn', 'aria-label': 'Menu', 'aria-expanded': 'false', 'data-sound': 'toggle' }, '');
    menu.appendChild(OwnIt.icons.svg('menu'));
    menu.addEventListener('click', function () {
      var open = head.getAttribute('data-open') !== 'true';
      head.setAttribute('data-open', open ? 'true' : 'false');
      menu.setAttribute('aria-expanded', open ? 'true' : 'false');
      // The mode toggle was measured while hidden: let every toggle re-place its thumb.
      try { if (open && window.dispatchEvent) window.dispatchEvent(new Event('resize')); } catch (e) { /* optional */ }
    });
    head.appendChild(menu);

    var tools = OwnIt.el('div', { 'class': 'header-tools' });
    var mode = OwnIt.el('div', { 'aria-label': 'Mode' });
    OwnIt.toggle(mode, [{ id: 'practice', label: 'Practice' }, { id: 'exam', label: 'Exam' }], OwnIt.mode, function (id) { OwnIt.mode = id; });
    tools.appendChild(mode);
    var a = OwnIt.audio;
    var st = (a && a.settings) || { sfx: true, music: true };
    tools.appendChild(iconToggle('music', 'music', !!st.music && !(a && a.isMuted && a.isMuted()), function (v) {
      if (a && a.setMusic) a.setMusic(v);
      OwnIt.toast(v ? 'Music on' : 'Music off');
    }));
    tools.appendChild(iconToggle('sound', 'sound effects', !!st.sfx, function (v) {
      if (a && a.setSfx) a.setSfx(v);
      OwnIt.toast(v ? 'Sound on' : 'Sound off');
      if (v) OwnIt.flap(xp.flap, String(Math.max(0, (p && p.xp) | 0)).padStart(5, '0'), { sound: true });
    }));
    var help = OwnIt.el('button', { type: 'button', 'class': 'icon-btn', 'aria-label': 'Keyboard help' });
    help.appendChild(OwnIt.icons.svg('help'));
    help.addEventListener('click', function () { OwnIt.keys.help(); });
    tools.appendChild(help);
    head.appendChild(tools);
    return head;
  }

  function panel(title, id) {
    var s = OwnIt.el('section', { 'class': 'panel rise', 'aria-labelledby': id });
    s.appendChild(OwnIt.el('h2', { id: id }, title));
    return s;
  }

  function emptyNote(cls, text) {
    return OwnIt.el('p', { 'class': 'empty well ' + cls }, text);
  }

  function chip(state) {
    return OwnIt.el('span', { 'class': 'chip' + (state === 'ready' ? ' ok' : '') }, STATE_LABEL[state]);
  }

  function recCard(r) {
    var meta = metaOf(r.game);
    var built = isBuilt(r.game);
    var btn = OwnIt.el('button', { type: 'button', 'class': 'card-rec', 'data-game': r.game, 'data-zone': r.zone, 'data-sound': 'card' });
    var top = OwnIt.el('div', { 'class': 'top' });
    top.appendChild(OwnIt.logo(meta));
    top.appendChild(OwnIt.el('span', { 'class': 'title' }, meta ? meta.name : r.game));
    btn.appendChild(top);
    btn.appendChild(OwnIt.el('span', { 'class': 'reason' }, String(r.reason || '')));
    var foot = OwnIt.el('span', { 'class': 'foot' });
    foot.appendChild(built ? chip(stateOf(r.game, r.zone)) : OwnIt.el('span', { 'class': 'chip off' }, 'Coming in a later update'));
    if (meta && meta.minutes) foot.appendChild(OwnIt.el('span', { 'class': 'mins' }, meta.minutes + ' min'));
    btn.appendChild(foot);
    btn.addEventListener('click', function () { pick(r.game, r.zone); });
    if (OwnIt.juice) OwnIt.juice.tilt(btn);
    hoverSound(btn);
    return btn;
  }

  function recommended() {
    var s = panel('Recommended for this app', 'rec-h');
    var list = recs().filter(function (r) { return r && typeof r.game === 'string' && metaOf(r.game); });
    if (!list.length) {
      s.appendChild(emptyNote('recs-empty', 'Nothing recommended yet. Ask Claude for recommendations, or pick a game below.'));
      return s;
    }
    var row = OwnIt.el('div', { 'class': 'recs' });
    list.slice(0, 5).forEach(function (r) { row.appendChild(recCard(r)); });
    s.appendChild(row);
    return s;
  }

  function rungCells(z) {
    var row = OwnIt.el('span', { 'class': 'rungs', 'aria-label': 'Rungs' });
    var done = [];
    RUNG_CHARS.forEach(function (rc) {
      var v = z.rungs && z.rungs[rc[0]];
      var cell = OwnIt.el('span', { 'class': 'rung-cell' + (v === 'cleared' ? ' c' : v === 'open' ? ' o' : ''), 'aria-hidden': 'true' }, rc[1]);
      row.appendChild(cell);
      if (v === 'cleared') done.push(rc[0]);
    });
    row.setAttribute('aria-label', 'Cleared: ' + (done.length ? done.join(', ') : 'none'));
    return row;
  }

  function board(onDetail) {
    var s = panel('Departures', 'dep-h');
    var zs = zones();
    if (!zs.length) {
      s.appendChild(emptyNote('board-empty', 'No zones yet. Ask Claude to set up your zones, then reload this page.'));
      return s;
    }
    var wrap = OwnIt.el('div', { 'class': 'board' });
    var table = OwnIt.el('div', { 'class': 'board-table', role: 'table' });
    var head = OwnIt.el('div', { 'class': 'board-row board-head', role: 'row' });
    ['Zone', 'Rungs', 'Next', 'Status'].forEach(function (h) { head.appendChild(OwnIt.el('span', { role: 'columnheader' }, h)); });
    table.appendChild(head);
    var statusFlaps = [];
    zs.forEach(function (zz) {
      var row = OwnIt.el('button', { type: 'button', 'class': 'board-row', 'data-zone': zz.id, role: 'row', 'data-sound': 'tile' });
      var name = OwnIt.el('span', { role: 'cell' });
      var nf = OwnIt.el('span');
      name.appendChild(nf);
      OwnIt.flap(nf, String(zz.z.name || zz.id));
      row.appendChild(name);
      var rc = OwnIt.el('span', { role: 'cell' });
      rc.appendChild(rungCells(zz.z));
      row.appendChild(rc);
      row.appendChild(OwnIt.el('span', { role: 'cell' }, nextText(zz.z)));
      var stc = OwnIt.el('span', { role: 'cell' });
      var sf = OwnIt.el('span', { 'class': zoneStatus(zz.id, zz.z).cls });
      stc.appendChild(sf);
      var stt = zoneStatus(zz.id, zz.z);
      OwnIt.flap(sf, stt.text, { variant: stt.variant });
      statusFlaps.push({ el: sf, text: stt.text, variant: stt.variant });
      row.appendChild(stc);
      row.addEventListener('click', function () { onDetail(zz.id); });
      table.appendChild(row);
    });
    wrap.appendChild(table);
    s.appendChild(wrap);
    // Idle shuffle: one status cell flips through glyphs and returns to its value, silently.
    if (!OwnIt.reduced() && statusFlaps.length) {
      var timer = setInterval(function () {
        if (!wrap.parentNode || !statusFlaps[0].el.parentNode) { clearInterval(timer); return; }
        var pickOne = statusFlaps[Math.floor(Math.random() * statusFlaps.length)];
        OwnIt.flap(pickOne.el, pickOne.text, { variant: pickOne.variant });
      }, 3800);
      var prev = cleanupHome;
      cleanupHome = function () { clearInterval(timer); if (prev) prev(); };
    }
    return s;
  }

  function zoneDetail(id) {
    var zz = zones().filter(function (z) { return z.id === id; })[0];
    var d = OwnIt.el('div', { 'class': 'zone-detail well', 'data-zone': id });
    if (!zz) return d;
    d.appendChild(OwnIt.el('h3', { 'class': 'panel-title' }, String(zz.z.name || id)));
    var cleared = RUNG_CHARS.filter(function (rc) { return zz.z.rungs && zz.z.rungs[rc[0]] === 'cleared'; }).map(function (rc) { return rc[0]; });
    d.appendChild(OwnIt.el('p', null, 'Cleared rungs: ' + (cleared.length ? cleared.join(', ') : 'none yet')));
    var weak = Array.isArray(zz.z.weakSpots) ? zz.z.weakSpots.length : 0;
    d.appendChild(OwnIt.el('p', null, weak ? weak + (weak === 1 ? ' weak spot to practice.' : ' weak spots to practice.') : 'No weak spots.'));
    var rec = recs().filter(function (r) { return r && r.zone === id && metaOf(r.game); })[0];
    var actions = OwnIt.el('div', { 'class': 'actions row' });
    if (rec) {
      actions.appendChild(OwnIt.button('Practice this', 'primary', function () { pick(rec.game, id); }));
    }
    d.appendChild(actions);
    return d;
  }

  function loadFilter() {
    try { var v = window.localStorage && window.localStorage.getItem('ownit-filter'); if (FILTERS.some(function (f) { return f.id === v; })) return v; } catch (e) { /* blocked */ }
    return 'all';
  }
  function saveFilter(v) { try { if (window.localStorage) window.localStorage.setItem('ownit-filter', v); } catch (e) { /* blocked */ } }

  function matches(g, f) {
    if (f === 'quick') return g.minutes <= 3;
    if (f === 'exam') return !!g.examReady;
    if (f === 'app') return !!g.usesScreens || recs().some(function (r) { return r && r.game === g.id; });
    return true;
  }

  function libTile(g) {
    var built = isBuilt(g.id);
    var recZone = (recs().filter(function (r) { return r && r.game === g.id; })[0] || {}).zone;
    var zone = recZone || boardingZone();
    var attrs = { type: 'button', 'class': 'tile-game' + (built ? '' : ' is-off'), 'data-game': g.id, 'data-sound': 'tile' };
    if (!built) { attrs.disabled = 'disabled'; attrs.title = 'Coming in a later update'; }
    var t = OwnIt.el('button', attrs);
    var top = OwnIt.el('div', { 'class': 'top' });
    top.appendChild(OwnIt.logo(g));
    t.appendChild(top);
    t.appendChild(OwnIt.el('span', { 'class': 'name' }, g.name));
    t.appendChild(OwnIt.el('span', { 'class': 'what' }, g.line));
    var meta = OwnIt.el('span', { 'class': 'meta' });
    meta.appendChild(OwnIt.el('span', { 'class': 'keys' }, g.keys || ''));
    var slot = OwnIt.el('span', { 'class': 'time' }, g.minutes + ' min');
    meta.appendChild(slot);
    t.appendChild(meta);
    if (built && zone) t.appendChild(chip(stateOf(g.id, zone)));
    else t.appendChild(OwnIt.el('span', { 'class': 'chip off' }, 'Coming in a later update'));
    if (built) {
      t.addEventListener('click', function () { pick(g.id, zone); });
      t.addEventListener('pointerenter', function () {
        if (OwnIt.reduced() || !OwnIt.mq('(hover: hover) and (pointer: fine)')) return;
        OwnIt.flap(slot, g.minutes + ' MIN');
      });
      hoverSound(t);
    }
    return t;
  }

  function library() {
    var s = panel('Game library', 'lib-h');
    var head = OwnIt.el('div', { 'class': 'lib-filter' });
    var all = games().slice().sort(function (a, b) { return (isBuilt(b.id) ? 1 : 0) - (isBuilt(a.id) ? 1 : 0); });
    var grid = OwnIt.el('div', { 'class': 'lib' });
    function fill(f) {
      grid.textContent = '';
      var shown = all.filter(function (g) { return matches(g, f); });
      if (!shown.length) grid.appendChild(emptyNote('lib-empty', 'No games match this filter.'));
      shown.forEach(function (g) { grid.appendChild(libTile(g)); });
    }
    var f0 = loadFilter();
    var tg = OwnIt.el('div', { 'aria-label': 'Filter games' });
    OwnIt.toggle(tg, FILTERS, f0, function (id) { saveFilter(id); fill(id); });
    head.appendChild(tg);
    s.appendChild(head);
    if (!all.length) {
      s.appendChild(emptyNote('lib-empty', 'No games found. Run own-it init again.'));
      return s;
    }
    fill(f0);
    s.appendChild(grid);
    return s;
  }

  function footer() {
    var f = OwnIt.el('footer', { 'class': 'foot-note rise' });
    f.appendChild(OwnIt.el('span', null, 'Everything own-it creates lives in '));
    f.appendChild(OwnIt.el('code', null, '.own-it/'));
    f.appendChild(OwnIt.el('span', null, '. Delete that folder to remove it all.'));
    if (OwnIt.link && OwnIt.link.mode !== 'live') {
      f.appendChild(OwnIt.el('p', { 'class': 'offline-note' }, 'Offline mode: answers download to your Downloads folder.'));
    }
    return f;
  }

  // ---------------------------------------------------------------- Home

  OwnIt.home = function (mount) {
    if (cleanupHome) { cleanupHome(); cleanupHome = null; }
    if (OwnIt.stopBuilding) OwnIt.stopBuilding();
    mount.textContent = '';
    var wrap = OwnIt.el('div', { 'class': 'wrap home' + (entered ? '' : ' enter') });
    var detailSlot = OwnIt.el('div', { 'class': 'detail-slot' });
    var boardPanel = board(function (id) {
      selectedZone = selectedZone === id ? null : id;
      detailSlot.textContent = '';
      if (selectedZone) detailSlot.appendChild(zoneDetail(selectedZone));
    });
    var parts = [header(), recommended(), boardPanel, library(), footer()];
    boardPanel.appendChild(detailSlot);
    parts.forEach(function (p, i) {
      if (!entered) p.style.animationDelay = (i * 80) + 'ms';
      wrap.appendChild(p);
    });
    if (selectedZone) detailSlot.appendChild(zoneDetail(selectedZone));
    mount.appendChild(wrap);
    entered = true;
    return wrap;
  };

  OwnIt.home._pick = pick;
  OwnIt.home._reset = function () { entered = false; building = {}; selectedZone = null; };
})();
