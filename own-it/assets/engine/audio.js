/* own-it engine: synthesized sound effects, settings and the shared audio graph (frontend spec 4.1, 4.2).
   Graph: master 0.45 -> compressor (-24 dB, 3:1) -> volume -> destination, with a short reverb send.
   No audio files. Nothing here throws when there is no AudioContext. Load after music.js. */
(function () {
  'use strict';
  var OwnIt = (window.OwnIt = window.OwnIt || {});

  var MAX_VOICES = 12;
  var DEFAULT_VOLUME = 0.8; // the approved mix is the gain at this volume
  var RATE = { clack: 0.055, hover: 0.04 }; // seconds between plays

  var settings = { sfx: true, music: true, volume: DEFAULT_VOLUME };
  var ctx = null, out = null, verb = null, volGain = null;
  var voices = [];
  var lastPlay = {};
  var muted = false;
  var buildTimer = null;
  var unlocked = false;

  // ---------------------------------------------------------------- settings

  function store() { try { return window.localStorage || null; } catch (e) { return null; } }
  function readKey(k) { try { var s = store(); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function writeKey(k, v) { try { var s = store(); if (s) s.setItem(k, v); } catch (e) { /* storage may be blocked */ } }
  function clamp01(v) { v = Number(v); return v >= 0 && v <= 1 ? v : (v > 1 ? 1 : 0); }

  (function load() {
    if (readKey('ownit-sfx') === 'off') settings.sfx = false;
    if (readKey('ownit-music') === 'off') settings.music = false;
    if (readKey('ownit-muted') === '1') muted = true;
    var v = readKey('ownit-volume');
    if (v !== null && v !== '' && isFinite(Number(v))) settings.volume = clamp01(v);
  })();

  function persist() {
    writeKey('ownit-sfx', settings.sfx ? 'on' : 'off');
    writeKey('ownit-music', settings.music ? 'on' : 'off');
    writeKey('ownit-volume', String(settings.volume));
    writeKey('ownit-muted', muted ? '1' : '0');
  }

  function applyVolume() {
    try { if (volGain) volGain.gain.value = settings.volume / DEFAULT_VOLUME; } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- graph

  function createGraph() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.15;
    out = ctx.createGain(); out.gain.value = 0.45;
    volGain = ctx.createGain();
    out.connect(comp); comp.connect(volGain); volGain.connect(ctx.destination);
    applyVolume();
    verb = ctx.createConvolver();
    var len = Math.floor(ctx.sampleRate * 0.35), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = ir.getChannelData(c);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    verb.buffer = ir;
    var vg = ctx.createGain(); vg.gain.value = 0.08;
    verb.connect(vg); vg.connect(out);
    return true;
  }

  // ---------------------------------------------------------------- voices

  function vary(v, p) { return v * (1 + (Math.random() * 2 - 1) * p); }

  function prune() {
    var now = ctx.currentTime;
    voices = voices.filter(function (v) { return v.end > now; });
  }

  function kill(v) {
    try {
      var t = ctx.currentTime;
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(Math.max(0.0001, Number(v.g.gain.value) || 0.0001), t);
      v.g.gain.linearRampToValueAtTime(0, t + 0.015); // 15 ms fade
      if (v.src && v.src.stop) v.src.stop(t + 0.02);
    } catch (e) { /* already stopped */ }
  }

  function reg(group, g, src, end) {
    prune();
    voices.push({ group: group, g: g, src: src, end: end });
    while (voices.length > MAX_VOICES) kill(voices.shift()); // drop the oldest
  }

  // Retriggering a group fades the previous instance in 15 ms.
  function choke(group) {
    if (!group) return;
    voices = voices.filter(function (v) {
      if (v.group !== group) return true;
      kill(v);
      return false;
    });
  }

  // One enveloped oscillator. Envelope starts from 0.0001 (no clicks).
  function tone(group, freq, type, t, dur, gain, wet, att) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vary(gain, 0.1), t + (att || 0.012));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    if (wet) g.connect(verb);
    o.start(t); o.stop(t + dur + 0.05);
    reg(group, g, o, t + dur + 0.05);
    return o;
  }

  function noise(group, t, dur, pow, ftype, freq, q, gain, wet) {
    var n = ctx.createBufferSource(), b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, pow);
    var f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = ftype; f.frequency.value = freq; if (q) f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vary(gain, 0.1), t + 0.003);
    n.buffer = b; n.connect(f); f.connect(g); g.connect(out);
    if (wet) g.connect(verb);
    n.start(t);
    reg(group, g, n, t + dur);
  }

  // ---------------------------------------------------------------- catalogue (frontend spec 4.2)

  var PRESS_BASE = { card: 330, tile: 440, toggle: 620, btn: 520, button: 520 };

  function sweep(group, t, f0, f1, tc, dur, peak, att) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + tc);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vary(peak, 0.1), t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.06);
    reg(group, g, o, t + dur + 0.06);
    return g;
  }

  function chime(t, mult, dur) {
    [659.25, 880, 1318.5].forEach(function (f, i) { tone('chime', vary(f * mult, 0.008), 'sine', t + i * 0.085, dur, 0.13, true); });
  }

  function levelup(t) {
    [523.25, 659.25, 783.99].forEach(function (f, i) { tone('fanfare', vary(f, 0.004), 'triangle', t + i * 0.09, 0.22, 0.1, false); });
    [523.25, 783.99, 1046.5].forEach(function (f) { tone('fanfare', vary(f, 0.004), 'sine', t + 0.3, 0.9, 0.075, true); });
    tone('fanfare', 2093, 'sine', t + 0.42, 0.25, 0.03, true);
  }

  var SOUNDS = {
    press: function (t, kind) {
      var base = PRESS_BASE[kind] || 520;
      sweep('press', t, vary(base * 1.5, 0.02), base, 0.05, 0.09, 0.16, 0.004);
      noise('press', t, 0.008, 3, 'highpass', 3500, 0, 0.08, false);
    },
    hover: function (t) { tone(null, vary(1400, 0.03), 'sine', t, 0.05, 0.025, false, 0.004); },
    clack: function (t) {
      noise('clack', t, 0.018, 5, 'bandpass', vary(2600, 0.06), 1.2, 0.22, false);
      tone('clack', vary(140, 0.04), 'sine', t, 0.045, 0.12, false);
    },
    toggle: function (t) { sweep('toggle', t, 520, 780, 0.12, 0.16, 0.12, 0.012).connect(verb); },
    correct: function (t) { chime(t, 1, 0.38); },
    wrong: function (t) { sweep('bonk', t, vary(200, 0.03), 120, 0.18, 0.24, 0.22, 0.012); },
    combo: function (t, n) { chime(t, Math.pow(2, Math.min(7, Math.max(0, Math.floor(Number(n) || 0))) / 12), 0.3); },
    'streak-break': function (t) {
      tone('chime', vary(523.25, 0.008), 'sine', t, 0.14, 0.12, true);
      tone('chime', vary(392, 0.008), 'sine', t + 0.12, 0.14, 0.12, true);
    },
    levelup: function (t) { levelup(t); if (OwnIt.audio) OwnIt.audio.duck(1200); },
    claim: function (t) {
      levelup(t);
      tone('fanfare', 65.41, 'sine', t, 1.2, 0.09, true, 0.35); // low C2 swell
      if (OwnIt.audio) OwnIt.audio.duck(1200);
    },
    hint: function (t) {
      tone('chime', vary(660, 0.008), 'sine', t, 0.18, 0.1, true);
      tone('chime', vary(880, 0.008), 'sine', t + 0.11, 0.19, 0.1, true); // a fourth up
    },
    'fog-lift': function (t) {
      var n = ctx.createBufferSource(), b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.7), ctx.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      var bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.Q.value = 0.8; bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.65);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      n.buffer = b; n.connect(bp); bp.connect(g); g.connect(out); g.connect(verb);
      n.start(t); n.stop(t + 0.75);
      reg('whoosh', g, n, t + 0.75);
    },
    tick: function (t, secs) {
      var s = Number(secs), f = s > 0 && s <= 3 ? 1000 + (4 - s) * 160 : 1000; // rises in the final 3 s
      tone(null, vary(f, 0.02), 'triangle', t, 0.04, 0.09, false, 0.003);
      noise(null, t, 0.012, 4, 'bandpass', 2200, 1.5, 0.05, false);
    },
    alarm: function (t) {
      for (var i = 0; i < 3; i++) {
        tone('alarm', 880, 'square', t + i * 0.3, 0.12, 0.035, false, 0.006);
        tone('alarm', 660, 'square', t + i * 0.3 + 0.14, 0.12, 0.035, false, 0.006);
      }
    }
  };

  function shuffle(t) { // one quiet flap shuffle: three soft snaps
    for (var i = 0; i < 3; i++) noise(null, t + i * 0.05, 0.016, 5, 'bandpass', vary(2200, 0.08), 1.0, 0.06, false);
  }

  function stopBuild() { if (buildTimer) { clearInterval(buildTimer); buildTimer = null; } }

  function wake() { try { if (ctx && ctx.state === 'suspended' && ctx.resume && !(typeof document !== 'undefined' && document.hidden)) ctx.resume(); } catch (e) { /* ignore */ } }

  function unref(t) { try { if (t && t.unref) t.unref(); } catch (e) { /* browser timers */ } return t; }

  // ---------------------------------------------------------------- public API

  var api = (OwnIt.audio = {
    settings: settings,

    play: function (name, arg) {
      try {
        if (!ctx || muted || !settings.sfx) return;
        wake();
        var t = ctx.currentTime;
        if (name === 'build-wait') {
          stopBuild();
          var runs = 0;
          var step = function () {
            if (!ctx || muted || !settings.sfx || ++runs > 9) { stopBuild(); return; } // silent after 10 s
            shuffle(ctx.currentTime);
          };
          shuffle(t); runs = 1;
          buildTimer = unref(setInterval(step, 1200));
          return;
        }
        var fn = SOUNDS[name];
        if (!fn) return;
        if (RATE[name]) {
          if (lastPlay[name] !== undefined && t - lastPlay[name] < RATE[name]) return;
          lastPlay[name] = t;
        }
        var group = { press: 'press', clack: 'clack', toggle: 'toggle', correct: 'chime', combo: 'chime', 'streak-break': 'chime', hint: 'chime', wrong: 'bonk', levelup: 'fanfare', claim: 'fanfare', 'fog-lift': 'whoosh', alarm: 'alarm' }[name];
        choke(group);
        fn(t, arg);
      } catch (e) { /* sound never breaks the UI */ }
    },

    stop: function (name) { if (name === 'build-wait') stopBuild(); },

    // First gesture: create the context, then start the music if it is on.
    unlock: function () {
      try {
        if (!unlocked) {
          if (!createGraph()) return;
          unlocked = true;
        }
        wake();
        if (settings.music && !muted && OwnIt.music) OwnIt.music.start();
      } catch (e) { /* no audio available */ }
    },

    setVolume: function (v) {
      settings.volume = clamp01(v);
      applyVolume();
      persist();
    },
    getVolume: function () { return settings.volume; },

    setSfx: function (on) {
      settings.sfx = !!on;
      if (!on) stopBuild();
      persist();
    },
    setMusic: function (on) {
      settings.music = !!on;
      persist();
      if (!OwnIt.music) return;
      if (on && !muted) OwnIt.music.start(); else OwnIt.music.stop();
    },

    // One-way mute and its inverse. Prefs (sfx/music) stay as they were; the mute flag is stored separately.
    mute: function () {
      muted = true;
      stopBuild();
      if (OwnIt.music) OwnIt.music.stop();
      persist();
      return true;
    },
    unmute: function () {
      muted = false;
      persist();
      if (settings.music && OwnIt.music) OwnIt.music.start();
      return false;
    },
    // M key. Returns true when muted.
    toggleMute: function () { return muted ? api.unmute() : api.mute(); },
    isMuted: function () { return muted; },

    duck: function (ms) { try { if (OwnIt.music && OwnIt.music.duck) OwnIt.music.duck(ms); } catch (e) { /* optional */ } },

    // Shared graph for music.js; null until the first gesture.
    _graph: function () { return ctx ? { ctx: ctx, out: out, verb: verb } : null; },
    _voiceCount: function () { if (ctx) prune(); return voices.length; }
  });

  // Browser policy: the context may only start on a user gesture. Pause and resume with the tab.
  try {
    var first = function () {
      window.removeEventListener('pointerdown', first, true);
      window.removeEventListener('keydown', first, true);
      api.unlock();
    };
    window.addEventListener('pointerdown', first, true);
    window.addEventListener('keydown', first, true);
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (!ctx) return;
        try {
          if (document.hidden) ctx.suspend(); // music and effects freeze together, so resume stays bar-aligned
          else wake();
        } catch (e) { /* ignore */ }
      });
    }
  } catch (e) { /* no window events in this environment */ }
})();
