/* own-it game template: Quests (design spec 6.2b, frontend spec 5.11, 5.12). The player walks one flow of their own app on the
   rebuilt screens (OwnIt.screenhost, sandboxed iframe). A quest pop-up shows the goal first; the objectives stay pinned in the side
   panel (stacked below the screen under 1024px). Tapping an element that follows the expected path ticks the next objective and,
   when the element has `goes`, loads the next screen. Anything else is a wrong turn (-5 XP) and shows the element's purpose.
   Some steps need a role: R opens the role switcher. Navigation facts (round.nav) are plain data; the expected path (round.answer)
   arrives obfuscated and is decoded on each tap. Keys: R role switcher, Q quest list, arrows + Enter move and tap. DOM via OwnIt.el only. */
(function () {
  'use strict';
  var OwnIt = window.OwnIt;
  var kit = OwnIt.kit;
  var XP_STEP = 10, XP_WRONG = 5, XP_CLEAN = 50;

  function own(obj, key) { return !!obj && Object.prototype.hasOwnProperty.call(obj, key); }
  function clock(s) { return ('0' + Math.floor(s / 60)).slice(-2) + ':' + ('0' + (s % 60)).slice(-2); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function play(root, round, ctx) {
    var objectives = (round && round.objectives) || [];
    var total = objectives.length;
    var nav = (round && round.nav) || {};
    var labels = round && round.labels;
    var exam = (round && round.mode === 'exam') || OwnIt.mode === 'exam';
    var mode = exam ? 'exam' : 'practice';
    var L = function (id) { return kit.label(id, labels); };

    // Roles in the order the nav names them. The player starts as the first role the first step allows.
    var roles = [];
    Object.keys(nav).forEach(function (id) {
      ((nav[id] && nav[id].roles) || []).forEach(function (r) { if (roles.indexOf(r) < 0) roles.push(r); });
    });
    var firstNav = total && own(nav, objectives[0].element) ? nav[objectives[0].element] : null;
    var role = (firstNav && firstNav.roles && firstNav.roles[0]) || roles[0] || '';

    var idx = 0;           // index of the next objective
    var wrong = [];        // [clickedId, expectedId]
    var started = false;
    var done = false;
    var screenId = round && round.start;
    var host = null;

    var shell = OwnIt.shell(root, ctx, { zone: round && round.zone, total: total, side: true });
    shell.setScore(0, total);
    var area = shell.area;
    var side = shell.side;

    // ---- play area: role bar, screen, feedback
    var bar = OwnIt.el('div', { 'class': 'quest-bar' });
    var roleLine = OwnIt.el('p', { 'class': 'quest-role', 'aria-live': 'polite' });
    var roleBtn = OwnIt.button('Switch role', 'secondary', function () { openRoles(); });
    var listBtn = OwnIt.button('Quest list', 'quiet', function () { openQuestInfo(); });
    if (!roles.length) roleBtn.setAttribute('hidden', 'hidden');
    [roleLine, roleBtn, listBtn].forEach(function (n) { bar.appendChild(n); });
    var screenBox = OwnIt.el('section', { 'class': 'quest-screen', 'aria-label': 'Screen copy' });
    var fallback = OwnIt.el('div', { 'class': 'answers quest-fallback', role: 'group', 'aria-label': 'Elements on this screen' });
    fallback.setAttribute('hidden', 'hidden');
    var feedback = OwnIt.el('div', { 'class': 'panel quest-feedback quiz-feedback', 'aria-live': 'polite' });
    [bar, screenBox, fallback, feedback].forEach(function (n) { area.appendChild(n); });
    area.classList.add('quest-area');
    area.setAttribute('tabindex', '-1');

    // ---- side panel: objectives
    var goalEl = OwnIt.el('p', { 'class': 'quest-goal' }, (round && round.goal) || '');
    var list = OwnIt.el('ol', { 'class': 'quest-list' });
    var checks = [];
    var rowEls = objectives.map(function (o, i) {
      var li = OwnIt.el('li', { 'class': 'quest-row', 'data-state': i === 0 ? 'now' : 'todo' });
      var box = OwnIt.el('span', { 'class': 'quest-check', 'aria-hidden': 'true' });
      checks.push(box);
      li.appendChild(box);
      li.appendChild(OwnIt.el('span', { 'class': 'quest-text' }, o.text));
      list.appendChild(li);
      return li;
    });
    var tally = OwnIt.el('p', { 'class': 'quest-tally' });
    var summary = OwnIt.el('div', { 'class': 'quest-summary', 'aria-live': 'polite' });
    side.appendChild(OwnIt.el('h2', { 'class': 'panel-title' }, 'Objectives'));
    [goalEl, list, tally, summary].forEach(function (n) { side.appendChild(n); });

    function paintRole() {
      roleLine.textContent = role ? 'Signed in as ' + L(role) + '.' : '';
      if (!role) roleLine.setAttribute('hidden', 'hidden'); else roleLine.removeAttribute('hidden');
    }
    function paintTally() {
      var cost = wrong.length * XP_WRONG;
      tally.textContent = plural(wrong.length, 'wrong turn', 'wrong turns') + (cost ? ' (-' + cost + ' XP)' : '') + '.';
    }
    function paintRows() {
      rowEls.forEach(function (li, i) {
        var state = i < idx ? 'done' : i === idx && !done ? 'now' : 'todo';
        li.setAttribute('data-state', state);
        var check = checks[i];
        check.textContent = '';
        if (state === 'done') check.appendChild(OwnIt.icons.svg('check'));
        if (state === 'now') li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      });
    }
    paintRole();
    paintTally();
    paintRows();

    // ---- screens
    function showFallback(id) {
      fallback.textContent = '';
      var els = Object.keys(nav).filter(function (e) { return nav[e] && nav[e].on === id; });
      if (!els.length) { fallback.setAttribute('hidden', 'hidden'); return; }
      fallback.removeAttribute('hidden');
      els.forEach(function (e) {
        var b = OwnIt.el('button', { type: 'button', 'class': 'answer' });
        b.appendChild(OwnIt.el('span', { 'class': 'answer-text' }, L(e)));
        b.addEventListener('click', function () { tapped(e); });
        fallback.appendChild(b);
      });
    }

    function loadScreen(id) {
      if (host) host.destroy();
      screenId = id;
      fallback.setAttribute('hidden', 'hidden');
      host = OwnIt.screenhost.mount(screenBox, id, { reserve: 185 });
      var mine = host;
      mine.onPick(function (eid) { if (mine === host) tapped(eid); });
      // No screen copy, or nothing tagged on it: offer the elements as buttons instead.
      mine.onReady(function () { if (mine === host && !mine.ids().length) showFallback(id); });
    }

    // ---- feedback
    function say(cls, lead, text) {
      feedback.textContent = '';
      kit.note(feedback, cls, lead, text);
    }

    function wrongTurn(clicked, expected, why) {
      wrong.push([clicked, expected]);
      OwnIt.sound('wrong');
      OwnIt.juice.shake(feedback);
      paintTally();
      feedback.textContent = '';
      kit.note(feedback, 'bad', "That's not how this flow goes. Why?", why);
      feedback.appendChild(OwnIt.el('p', { 'class': 'quiz-xp quest-cost' }, '-' + XP_WRONG + ' XP'));
    }

    function tapped(id) {
      if (done || !started || kit.modalOpen()) return;
      var path = OwnItCore.decode(round.answer); // the expected path is only decoded here, per tap
      var step = path && path[idx];
      if (!step) return;
      if (id !== step.element) {
        var purpose = own(labels, id) && labels[id] && labels[id].purpose;
        wrongTurn(id, step.element, exam ? 'Try a different spot.' : (purpose || L(id) + ' is not the next step.'));
        return;
      }
      var needs = own(nav, id) && nav[id].roles;
      if (needs && needs.length && needs.indexOf(role) < 0) {
        wrongTurn(id, id, exam ? 'Wrong account for this step.' : 'You are signed in as ' + L(role) + ', but this step is for ' + needs.map(L).join(' or ') + '. Press R to switch role.');
        return;
      }
      tick(id, step);
    }

    function tick(id, step) {
      var li = rowEls[idx];
      idx++;
      OwnIt.sound('correct');
      OwnIt.juice.confetti(li);
      shell.setScore(idx, total);
      paintRows();
      if (idx >= total) return finish();
      say('good', 'Done.', objectives[idx - 1].text + ' Next: ' + objectives[idx].text);
      var next = own(nav, objectives[idx].element) ? nav[objectives[idx].element] : null;
      var dest = (own(nav, id) && nav[id].goes) || step.goes || (next && next.on !== screenId ? next.on : null);
      if (dest && dest !== screenId) loadScreen(dest);
    }

    function finish() {
      done = true;
      var clean = wrong.length === 0;
      var xp = Math.max(0, total * XP_STEP - wrong.length * XP_WRONG + (clean ? XP_CLEAN : 0));
      var secs = shell.seconds();
      shell.stopTimer();
      summary.textContent = '';
      summary.appendChild(OwnIt.el('h3', { 'class': 'panel-title' }, 'Quest complete'));
      summary.appendChild(OwnIt.el('p', null, total + ' of ' + total + ' objectives done.'));
      summary.appendChild(OwnIt.el('p', null, plural(wrong.length, 'wrong turn', 'wrong turns') + '.'));
      summary.appendChild(OwnIt.el('p', null, 'Time ' + clock(secs) + '.'));
      say('good', 'Quest complete.', clean ? 'No wrong turns.' : 'Walk it again to get the clean run bonus.');
      if (clean) { OwnIt.sound('levelup'); OwnIt.juice.confetti(summary); }
      var review = wrong.map(function (w) {
        return { text: 'Wrong turn: ' + L(w[0]) + (w[0] === w[1] ? ' needed another role.' : ' instead of ' + L(w[1]) + '.') };
      });
      kit.finish(shell, ctx, { game: 'quests', mode: mode, got: total, of: total, xp: xp, missed: [], review: review, extra: { wrong: wrong } });
    }

    // ---- dialogs
    function listNode(parent) {
      parent.appendChild(OwnIt.el('p', { 'class': 'quest-goal' }, (round && round.goal) || ''));
      var ol = OwnIt.el('ol', { 'class': 'quest-intro' });
      objectives.forEach(function (o) { ol.appendChild(OwnIt.el('li', null, o.text)); });
      parent.appendChild(ol);
    }

    var introApi = null;
    function openIntro() {
      var begun = false;
      OwnIt.dialog(function (dlg, api) {
        introApi = api;
        dlg.classList.add('quest-dialog');
        var title = OwnIt.el('div', { 'class': 'banner' });
        dlg.appendChild(title);
        OwnIt.flap(title, 'QUEST');
        listNode(dlg);
        var actions = OwnIt.el('div', { 'class': 'actions' });
        var backBtn = OwnIt.button('Back', 'quiet', function () { api.close(); });
        actions.appendChild(backBtn);
        function begin() { if (begun) return; begun = true; api.close(); }
        actions.appendChild(OwnIt.button('Start quest', 'primary', begin, { 'data-autofocus': '1' }));
        dlg.appendChild(actions);
        dlg.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && e.target !== backBtn) { e.preventDefault(); begin(); }
        });
      }, { label: 'Quest', onClose: function () {
        introApi = null;
        if (done) return;
        if (begun) { started = true; shell.startTimer(); focusScreen(); } else ctx.router.go('home');
      } });
    }

    function openQuestInfo() {
      if (!started || done || kit.modalOpen()) return;
      OwnIt.dialog(function (dlg, api) {
        dlg.appendChild(OwnIt.el('h2', null, 'Quest list'));
        listNode(dlg);
        var actions = OwnIt.el('div', { 'class': 'actions' });
        actions.appendChild(OwnIt.button('Back to quest', 'primary', function () { api.close(); }, { 'data-autofocus': '1' }));
        dlg.appendChild(actions);
      }, { label: 'Quest list' });
    }

    // After a role switch the player lands where that role works: the next objective's screen if it is theirs,
    // else the first screen that role has an element on.
    function screenForRole(r) {
      if (done) return;
      var next = idx < total && own(nav, objectives[idx].element) ? nav[objectives[idx].element] : null;
      var dest = null;
      if (next && next.roles && next.roles.indexOf(r) >= 0) dest = next.on;
      else {
        Object.keys(nav).some(function (e) {
          if (nav[e] && nav[e].roles && nav[e].roles.indexOf(r) >= 0) { dest = nav[e].on; return true; }
          return false;
        });
      }
      if (dest && dest !== screenId) loadScreen(dest);
    }

    function openRoles() {
      if (!started || done || kit.modalOpen()) return;
      if (!roles.length) { if (ctx.toast) ctx.toast('This quest has no roles to switch.'); return; }
      OwnIt.dialog(function (dlg, api) {
        dlg.appendChild(OwnIt.el('h2', null, 'Switch role'));
        dlg.appendChild(OwnIt.el('p', null, 'Pick who you are signed in as.'));
        var group = OwnIt.el('div', { 'class': 'answers', role: 'group', 'aria-label': 'Roles' });
        roles.forEach(function (r) {
          var b = OwnIt.el('button', { type: 'button', 'class': 'answer', 'aria-pressed': r === role ? 'true' : 'false' });
          b.appendChild(OwnIt.el('span', { 'class': 'answer-text' }, L(r)));
          if (r === role) b.setAttribute('data-autofocus', '1');
          b.addEventListener('click', function () {
            var changed = r !== role;
            role = r;
            paintRole();
            OwnIt.sound('click');
            say('good', 'Role changed.', 'You are signed in as ' + L(r) + '.');
            if (changed) screenForRole(r);
            api.close();
          });
          group.appendChild(b);
        });
        dlg.appendChild(group);
        dlg.appendChild(OwnIt.button('Cancel', 'quiet', function () { api.close(); }));
      }, { label: 'Switch role' });
    }

    function focusScreen() {
      if (area.focus) { try { area.focus(); } catch (e) { /* not focusable */ } }
    }

    // ---- keys
    var offs = [];
    offs.push(kit.onActivate(ctx, area, 'r', openRoles));
    offs.push(kit.onActivate(ctx, area, 'q', openQuestInfo));
    [['ArrowRight', 1], ['ArrowDown', 1], ['ArrowLeft', -1], ['ArrowUp', -1]].forEach(function (p) {
      offs.push(ctx.keys.on(p[0], function (e) {
        if (!started || done || kit.modalOpen() || !kit.mine(e, area) || !host) return;
        if (e && e.preventDefault) e.preventDefault();
        host.move(p[1]);
      }));
    });
    offs.push(kit.onActivate(ctx, area, 'Enter', function () {
      if (started && !done && host) host.pickCurrent();
    }));

    if (total) {
      loadScreen(screenId);
      say('good', 'Goal.', (round.goal || '') + ' Tap the right spot on the screen to start.');
      openIntro();
    } else {
      done = true;
      shell.stopTimer();
      feedback.textContent = 'This quest has no objectives. Ask Claude to build a new quest round, then pick it again from the board.';
    }

    return function () {
      done = true;
      if (introApi) { try { introApi.close(); } catch (e) { /* already closed */ } }
      offs.forEach(function (off) { try { off(); } catch (e) { /* gone */ } });
      if (host) host.destroy();
      shell.destroy();
    };
  }

  OwnIt.register({
    id: 'quests',
    name: 'Quests',
    minutes: 6,
    keys: [['Arrows', 'Move between spots on the screen'], ['Enter', 'Tap the spot'], ['R', 'Switch role'], ['Q', 'Show the quest list'], ['Esc', 'Leave']],
    play: play
  });
})();
