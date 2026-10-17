/* own-it engine: generative music. OwnIt.musicPlan(bar) is a PURE planner (frontend spec 4.3);
   OwnIt.music only renders that plan on the shared audio graph from audio.js. Load before audio.js. */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});

  var BAR = 4.0;
  var BEAT = BAR / 8; // one eighth note
  var BUS_LEVEL = 0.055;

  // Chord = bass root + 5 chord tones (the pad uses the first four). Key of C major, equal temperament.
  var PROG_A = [
    { b: 36, ch: [60, 64, 67, 72, 76] }, { b: 43, ch: [59, 62, 67, 71, 74] },
    { b: 45, ch: [57, 60, 64, 69, 72] }, { b: 41, ch: [57, 60, 65, 69, 72] }
  ];
  var PROG_B = [
    { b: 41, ch: [57, 60, 65, 69, 72] }, { b: 43, ch: [59, 62, 67, 71, 74] },
    { b: 40, ch: [59, 64, 67, 71, 76] }, { b: 45, ch: [57, 60, 64, 69, 72] }
  ];
  var MEL_A = [[76, 74, 72, 74], [74, 71, 74, 79], [72, 76, 79, 76], [77, 76, 74, 72], [76, 79, 76, 74], [74, 79, 74, 71], [72, 74, 76, 72], [72, 69, 72, 77]];
  var MEL_B = [[72, 69, 72, 77], [74, 71, 74, 79], [76, 71, 79, 76], [76, 72, 69, 72], [77, 76, 72, 69], [79, 74, 71, 74], [71, 76, 79, 83], [81, 79, 76, 72]];
  var ARP_PATTERN = [0, 1, 2, 1, 3, 1, 2, 1];

  // 8 sections of 4 bars = 32 bars per cycle (about 2 min 8 s).
  var PLAN = [
    { p: 'A', pad: 1, bass: 1, arp: 0, drum: 0, mel: 0 },
    { p: 'A', pad: 1, bass: 1, arp: 1, drum: 0, mel: 0 },
    { p: 'A', pad: 1, bass: 1, arp: 1, drum: 1, mel: 0 },
    { p: 'A', pad: 1, bass: 1, arp: 1, drum: 1, mel: 1 },
    { p: 'B', pad: 1, bass: 1, arp: 1, drum: 1, mel: 1 },
    { p: 'B', pad: 1, bass: 1, arp: 1, drum: 1, mel: 0 },
    { p: 'A', pad: 1, bass: 1, arp: 1, drum: 0, mel: 0 },
    { p: 'A', pad: 1, bass: 1, arp: 0, drum: 0, mel: 0 }
  ];
  var FADE_IN = [0.3, 0.6, 0.85, 1];
  var FADE_OUT = [1, 0.85, 0.55, 0.28];
  var PAD_REENTRY = [0.55, 0.85];

  function sectionOf(bar) { return Math.floor(bar / 4) % PLAN.length; }

  // Fade level (0..1) of one layer key (pad, bass, arp, drum, mel) in a bar.
  function level(key, bar) {
    var si = sectionOf(bar), b4 = ((bar % 4) + 4) % 4;
    var L = PLAN[si], Lp = PLAN[(si + PLAN.length - 1) % PLAN.length], Ln = PLAN[(si + 1) % PLAN.length];
    if (!L[key]) return 0;
    if (!Lp[key]) return FADE_IN[b4];
    if (!Ln[key]) return FADE_OUT[b4];
    return 1;
  }

  // Pure: no randomness, no audio. t is seconds from the bar start. Layers without midi are unpitched.
  function plan(bar) {
    bar = Math.floor(bar);
    var cyc = ((bar % 32) + 32) % 32;
    var si = sectionOf(cyc), L = PLAN[si], b4 = cyc % 4;
    var c = (L.p === 'B' ? PROG_B : PROG_A)[b4];
    var ev = [];
    var i;

    if (L.pad) {
      var pf = cyc < 2 ? PAD_REENTRY[cyc] : 1;
      for (i = 0; i < 4; i++) ev.push({ t: 0, midi: c.ch[i], layer: 'pad', vel: 0.016 * pf, dur: 6.2, a: 1.8, rel: 2.6, pan: (i - 1.5) * 0.3 });
    }
    if (L.bass) {
      ev.push({ t: 0, midi: c.b, layer: 'bass', vel: 0.09, dur: 2.34, a: 0.04, rel: 0.8 });
      ev.push({ t: BEAT * 4, midi: c.b, layer: 'bass', vel: 0.07, dur: 1.64, a: 0.04, rel: 0.6 });
      ev.push({ t: BEAT * 6, midi: c.b + 12, layer: 'bass', vel: 0.04, dur: 0.83, a: 0.03, rel: 0.4 });
    }
    if (L.arp) {
      var al = level('arp', cyc);
      for (i = 0; i < 8; i++) {
        var ix = ARP_PATTERN[i], at = i * BEAT;
        ev.push({ t: at, midi: c.ch[ix], layer: 'arp', vel: (i === 0 ? 0.16 : 0.11) * al, dur: Math.min(BEAT * 1.8, BAR - at), pan: (ix - 1.5) * 0.15 });
      }
    }
    if (L.mel) {
      var ml = level('mel', cyc);
      var phrase = (L.p === 'B' ? MEL_B : MEL_A)[(cyc % 4) + (Math.floor(cyc / 16) % 2) * 4];
      for (i = 0; i < phrase.length; i++) ev.push({ t: i * BEAT * 2, midi: phrase[i], layer: 'mel', vel: 0.1 * ml, dur: Math.min(BEAT * 1.9, BAR - i * BEAT * 2), pan: 0.12 });
    }
    if (L.drum) {
      var dv = level('drum', cyc);
      ev.push({ t: 0, layer: 'kick', vel: 0.5 * dv, dur: 0.3 });
      ev.push({ t: BEAT * 3, layer: 'kick', vel: 0.32 * dv, dur: 0.3 });
      ev.push({ t: BEAT * 4, layer: 'kick', vel: 0.45 * dv, dur: 0.3 });
      ev.push({ t: BEAT * 2, layer: 'snare', vel: 0.07 * dv, dur: 0.18 });
      ev.push({ t: BEAT * 6, layer: 'snare', vel: 0.08 * dv, dur: 0.18 });
      for (i = 0; i < 8; i++) ev.push({ t: i * BEAT, layer: 'hat', vel: dv, dur: 0.04 });
    } else if (L.arp) {
      for (i = 1; i < 8; i += 2) ev.push({ t: i * BEAT, layer: 'hat', vel: 1, dur: 0.04 });
    }
    if (cyc === 31) {
      ev.push({ t: 0, layer: 'turn', kind: 'swell', vel: 0.035, dur: BAR + 0.5 });
      [72, 76, 79, 84].forEach(function (n, k) {
        ev.push({ t: BEAT * 5 + k * BEAT * 0.5, midi: n, layer: 'turn', kind: 'bell', vel: 0.07, dur: BAR * 0.9, pan: (k - 1.5) * 0.3 });
      });
      ev.push({ t: 0, midi: c.b - 12, layer: 'turn', kind: 'root', vel: 0.05, dur: 5.6, a: 1.2, rel: 1.8 });
    }
    return ev;
  }

  OwnIt.musicPlan = plan;
  OwnIt.musicLevel = level;
  OwnIt.MUSIC_PLAN = PLAN;

  // ---------------------------------------------------------------- renderer (browser only)

  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  var running = null;
  var graph = null; // built once per AudioContext and reused across start/stop

  function unref(t) { try { if (t && t.unref) t.unref(); } catch (e) { /* browser timers have no unref */ } return t; }

  function build(g) {
    var ctx = g.ctx, out = g.out, verb = g.verb;
    var bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out);
    var send = ctx.createGain(); send.gain.value = 0.6; bus.connect(send); send.connect(verb);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800; lp.Q.value = 0.6; lp.connect(bus);
    // quarter-note echo (feedback 0.18, wet low)
    var echo = ctx.createDelay(1); echo.delayTime.value = BEAT * 2;
    var fb = ctx.createGain(); fb.gain.value = 0.18;
    var eg = ctx.createGain(); eg.gain.value = 0.25;
    echo.connect(fb); fb.connect(echo); echo.connect(eg); eg.connect(bus);
    // electric piano chain: peaking body into a 3.4 kHz low-pass
    var gtrIn = ctx.createGain(); gtrIn.gain.value = 1;
    var body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 220; body.gain.value = 3; body.Q.value = 0.8;
    var tone2 = ctx.createBiquadFilter(); tone2.type = 'lowpass'; tone2.frequency.value = 3400; tone2.Q.value = 0.5;
    var gtrOut = ctx.createGain(); gtrOut.gain.value = 0.9;
    gtrIn.connect(body); body.connect(tone2); tone2.connect(gtrOut); gtrOut.connect(bus);
    var gEcho = ctx.createGain(); gEcho.gain.value = 0.18; gtrOut.connect(gEcho); gEcho.connect(echo);
    return { ctx: ctx, bus: bus, verb: verb, lp: lp, gtrIn: gtrIn };
  }

  function noiseBuf(ctx, secs, pow) {
    var b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (pow ? Math.pow(1 - i / d.length, pow) : 1);
    return b;
  }

  function panned(ctx, node, pan) {
    if (!ctx.createStereoPanner) return node;
    var p = ctx.createStereoPanner(); p.pan.value = pan || 0; node.connect(p); return p;
  }

  function voice(R, freq, type, t, a, hold, rel, peak, dest, pan) {
    var ctx = R.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    hold = Math.max(0, hold);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
    o.connect(g); panned(ctx, g, pan).connect(dest);
    o.start(t); o.stop(t + a + hold + rel + 0.05);
  }

  // FM electric piano: carrier = modulator frequency, index 2.2f to 0.12f over 0.35 s, plus a faint x4 bell partial.
  function ep(R, midi, t, vel, pan, dur) {
    var ctx = R.ctx, f = hz(midi);
    var car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), amp = ctx.createGain();
    car.type = 'sine'; mod.type = 'sine'; car.frequency.value = f; mod.frequency.value = f;
    mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.12, t + 0.35);
    mod.connect(mg); mg.connect(car.frequency);
    amp.gain.setValueAtTime(0.0001, t); amp.gain.exponentialRampToValueAtTime(vel, t + 0.005);
    amp.gain.exponentialRampToValueAtTime(vel * 0.35, t + Math.min(0.6, dur * 0.5)); amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var bell = ctx.createOscillator(), bg = ctx.createGain();
    bell.type = 'sine'; bell.frequency.value = f * 4;
    bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(vel * 0.12, t + 0.003); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    car.connect(amp); bell.connect(bg); bg.connect(amp);
    panned(ctx, amp, pan).connect(R.gtrIn);
    [car, mod, bell].forEach(function (o) { o.start(t); o.stop(t + dur + 0.05); });
  }

  function kick(R, t, v) {
    if (v <= 0.001) return;
    var ctx = R.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g); g.connect(R.bus); o.start(t); o.stop(t + 0.3);
  }

  function snare(R, t, v) {
    if (v <= 0.001) return;
    var ctx = R.ctx, n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuf(ctx, 0.18, 4);
    bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.003);
    n.connect(bp); bp.connect(g); g.connect(R.bus); n.start(t);
    var o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 196;
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(v * 0.5, t + 0.003); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(og); og.connect(R.bus); o.start(t); o.stop(t + 0.1);
  }

  function hat(R, t, lvl) {
    if (lvl <= 0) return;
    var ctx = R.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuf(ctx, 0.04, 6);
    f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * lvl * (0.75 + Math.random() * 0.25), t + 0.002);
    n.connect(f); f.connect(g); g.connect(R.bus); n.start(t);
  }

  function swell(R, t) {
    var ctx = R.ctx, n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = noiseBuf(ctx, BAR, 0);
    bp.type = 'bandpass'; bp.Q.value = 0.7; bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(2600, t + BAR * 0.9);
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.035, t + BAR * 0.85); ng.gain.exponentialRampToValueAtTime(0.0001, t + BAR + 0.4);
    n.connect(bp); bp.connect(ng); ng.connect(R.bus); ng.connect(R.verb); n.start(t); n.stop(t + BAR + 0.5);
  }

  // Renders one planned event at absolute time t0 + e.t.
  function render(R, e, t0) {
    var t = t0 + e.t;
    switch (e.layer) {
      case 'pad':
        voice(R, hz(e.midi), 'sine', t, e.a, e.dur - e.a - e.rel, e.rel, e.vel, R.lp, e.pan);
        voice(R, hz(e.midi), 'triangle', t, e.a, e.dur - e.a - e.rel, e.rel, e.vel, R.lp, e.pan);
        break;
      case 'bass': voice(R, hz(e.midi), 'sine', t, e.a, e.dur - e.a - e.rel, e.rel, e.vel, R.bus); break;
      case 'arp': case 'mel': ep(R, e.midi, t, e.vel, e.pan, e.dur); break;
      case 'kick': kick(R, t, e.vel); break;
      case 'snare': snare(R, t, e.vel); break;
      case 'hat': hat(R, t, e.vel); break;
      case 'turn':
        if (e.kind === 'swell') swell(R, t);
        else if (e.kind === 'bell') ep(R, e.midi, t, e.vel, e.pan, e.dur);
        else if (e.kind === 'root') voice(R, hz(e.midi), 'sine', t, e.a, e.dur - e.a - e.rel, e.rel, e.vel, R.bus);
        break;
    }
  }

  function wanted() { return !!(OwnIt.audio && OwnIt.audio.settings && OwnIt.audio.settings.music && !(OwnIt.audio.isMuted && OwnIt.audio.isMuted())); }

  OwnIt.music = {
    start: function (fromBar) {
      try {
        if (running || !wanted() || !OwnIt.audio._graph) return;
        var g = OwnIt.audio._graph();
        if (!g) return; // not unlocked yet: audio.unlock() calls start() again
        if (!graph || graph.ctx !== g.ctx) graph = build(g);
        var R = graph;
        R.bus.gain.cancelScheduledValues(g.ctx.currentTime);
        R.bus.gain.setTargetAtTime(BUS_LEVEL, g.ctx.currentTime, 3);
        var S = { R: R, bar: fromBar > 0 ? Math.floor(fromBar) : 0, next: g.ctx.currentTime + 0.1, timer: null, alive: true };
        running = S;
        var tick = function () {
          if (!S.alive) return;
          var ctx = S.R.ctx;
          while (S.next < ctx.currentTime + BAR * 1.5) { // look-ahead 1.5 bars; paused with the context when the tab is hidden
            var events = plan(S.bar);
            for (var i = 0; i < events.length; i++) render(S.R, events[i], S.next);
            S.next += BAR; S.bar++;
          }
          S.timer = unref(setTimeout(tick, 500));
        };
        tick();
      } catch (e) { running = null; }
    },
    stop: function () {
      var S = running;
      if (!S) return;
      running = null; S.alive = false;
      clearTimeout(S.timer);
      try {
        S.R.bus.gain.cancelScheduledValues(S.R.ctx.currentTime);
        S.R.bus.gain.setTargetAtTime(0, S.R.ctx.currentTime, 0.8);
      } catch (e) { /* context closed */ }
    },
    isRunning: function () { return !!running; },
    // Ducks the music by 40% for ms, then eases back.
    duck: function (ms) {
      var S = running;
      if (!S) return;
      try {
        var p = S.R.bus.gain, now = S.R.ctx.currentTime;
        p.cancelScheduledValues(now);
        p.setTargetAtTime(BUS_LEVEL * 0.6, now, 0.05);
        p.setTargetAtTime(BUS_LEVEL, now + (ms || 1200) / 1000, 0.3);
      } catch (e) { /* ducking is optional */ }
    }
  };
})();
