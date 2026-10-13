/* own-it core: anti-spoiler codec and board graders.
 * Classic script shared by the game page (global `OwnItCore`) and Node (CommonJS
 * `module.exports`, loaded via scripts/lib/core.mjs). No Buffer/btoa so both
 * environments produce identical output. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OwnItCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KEY = 'own-it:anti-spoiler:v1';
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  // English fillers plus HTTP/route words, so "release cable endpoint" matches "POST /locks/:id/release-cable".
  const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'for', 'in', 'on',
    'get', 'post', 'put', 'patch', 'delete', 'id', 'api', 'endpoint', 'route']);

  // ---- codec ----

  function toBase64(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] +
        (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') +
        (i + 2 < bytes.length ? B64[n & 63] : '=');
    }
    return out;
  }

  // Ignores whitespace, padding and any non-alphabet characters. A final block of
  // k remaining chars (2..4) yields k - 1 bytes; a lone trailing char carries no byte.
  function fromBase64(str) {
    const clean = String(str).replace(/[^A-Za-z0-9+/]/g, '');
    const out = [];
    for (let i = 0; i < clean.length; i += 4) {
      const chars = Math.min(4, clean.length - i);
      let n = 0;
      for (let j = 0; j < 4; j++) n = (n << 6) | (j < chars ? B64.indexOf(clean[i + j]) : 0);
      if (chars >= 2) out.push((n >> 16) & 255);
      if (chars >= 3) out.push((n >> 8) & 255);
      if (chars >= 4) out.push(n & 255);
    }
    return Uint8Array.from(out);
  }

  const KEY_BYTES = new TextEncoder().encode(KEY);
  function xor(bytes) {
    return bytes.map(function (b, i) { return b ^ KEY_BYTES[i % KEY_BYTES.length]; });
  }

  function encode(obj) {
    return toBase64(xor(new TextEncoder().encode(JSON.stringify(obj))));
  }
  function decode(str) {
    return JSON.parse(new TextDecoder().decode(xor(fromBase64(str))));
  }

  // ---- graders ----

  // Collision-free key for a directed pair of ids.
  function pairKey(from, to) { return JSON.stringify([from, to]); }

  // Distinct directed edges, first occurrence order.
  function uniqueEdges(edges) {
    const seen = new Set();
    const out = [];
    for (const e of edges) {
      const k = pairKey(e[0], e[1]);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([e[0], e[1]]);
    }
    return out;
  }

  function gradeComponent(answer, userEdges) {
    const distinct = uniqueEdges(userEdges);
    const user = new Set(distinct.map(function (e) { return pairKey(e[0], e[1]); }));
    const expected = new Set();
    const missed = [];
    let got = 0;
    for (const e of answer.edges) {
      const k = pairKey(e.from, e.to);
      expected.add(k);
      if (user.has(k)) got++;
      else missed.push(e.id);
    }
    const wrong = distinct.filter(function (e) { return !expected.has(pairKey(e[0], e[1])); });
    return { got: got, of: answer.edges.length, missed: missed, wrong: wrong };
  }

  // Longest non-decreasing subsequence of seq[].g. Returns indices into seq.
  // Ties: the first-found best length ending earliest, with earliest predecessors.
  function longestNonDecreasing(seq) {
    const n = seq.length;
    const len = new Array(n).fill(1);
    const prev = new Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < i; j++) {
        if (seq[j].g <= seq[i].g && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
      }
    }
    let best = -1;
    for (let i = 0; i < n; i++) if (best < 0 || len[i] > len[best]) best = i;
    const out = [];
    for (let i = best; i >= 0; i = prev[i]) out.unshift(i);
    return out;
  }

  function gradeSwimlanes(answer, placed) {
    const groupOf = new Map();
    const order = [];
    answer.steps.forEach(function (group, g) {
      for (const id of group) {
        if (!groupOf.has(id)) { groupOf.set(id, g); order.push(id); }
      }
    });
    // Known cards only; a card placed more than once counts at its first position.
    const seen = new Set();
    const seq = [];
    for (const p of placed) {
      if (!groupOf.has(p.id) || seen.has(p.id)) continue;
      seen.add(p.id);
      seq.push({ g: groupOf.get(p.id), id: p.id, lane: p.lane });
    }
    const kept = new Set();
    let got = 0;
    for (const i of longestNonDecreasing(seq)) {
      const c = seq[i];
      kept.add(c.id);
      got += c.lane === answer.lanes[c.id] ? 1 : 0.5;
    }
    return {
      got: got,
      of: order.length,
      missed: order.filter(function (id) { return !kept.has(id); }),
      wrong: [],
    };
  }

  function gradeBreak(answer, placements) {
    const missed = [];
    const wrong = [];
    let got = 0;
    for (const t of answer.threats) {
      const placedCard = Object.prototype.hasOwnProperty.call(placements, t.id) ? placements[t.id] : undefined;
      if (placedCard === t.card) { got++; continue; }
      missed.push(t.id);
      if (placedCard !== undefined && placedCard !== null) wrong.push([t.id, placedCard]);
    }
    return { got: got, of: answer.threats.length, missed: missed, wrong: wrong };
  }

  // Plain plural: "trips" -> "trip"; keeps short words and "-ss" ("access").
  function singular(t) { return t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t; }

  // Words of a label: camelCase split, lowercased, stopwords dropped, plurals folded.
  function tokens(label) {
    const set = new Set();
    const spaced = String(label == null ? '' : label)
      .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
      .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2');
    for (const t of spaced.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (t && !STOPWORDS.has(t)) set.add(singular(t));
    }
    return set;
  }

  function jaccard(a, b) {
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    return inter / (a.size + b.size - inter);
  }

  // Greedy one-to-one: highest score first; ties broken by box order then card order.
  function matchLabels(boxes, cards) {
    const cardTokens = cards.map(function (c) { return tokens(c.label); });
    const pairs = [];
    boxes.forEach(function (box, bi) {
      const bt = tokens(box.label);
      cards.forEach(function (card, ci) {
        const s = jaccard(bt, cardTokens[ci]);
        if (s >= 0.5) pairs.push({ s: s, bi: bi, ci: ci });
      });
    });
    pairs.sort(function (x, y) { return y.s - x.s || x.bi - y.bi || x.ci - y.ci; });
    const usedBox = new Set();
    const usedCard = new Set();
    const out = {};
    for (const p of pairs) {
      if (usedBox.has(p.bi) || usedCard.has(p.ci)) continue;
      usedBox.add(p.bi);
      usedCard.add(p.ci);
      out[boxes[p.bi].uid] = cards[p.ci].id;
    }
    return out;
  }

  // Boxes are matched against the whole zone (`answer.pool`, falling back to the scored cards).
  // `map`: box uid -> scored card id. `neutral`: box uid -> id of a zone card outside the scored set.
  function matchBoss(answer, boxes) {
    const scored = new Set(answer.cards.map(function (c) { return c.id; }));
    const all = matchLabels(boxes, answer.pool || answer.cards);
    const map = {};
    const neutral = {};
    Object.keys(all).forEach(function (uid) {
      if (scored.has(all[uid])) map[uid] = all[uid];
      else neutral[uid] = all[uid];
    });
    return { map: map, neutral: neutral };
  }

  // Edges are graded in card space; `wrong` is reported as the user's own [uidFrom, uidTo]
  // pairs (an edge touching an unmatched box has no card id to report). Boxes naming a zone
  // card outside the scored set, and arrows touching them, are neutral: no points, not wrong.
  // The page converts these uid pairs to label pairs for the payload.
  function gradeBoss(answer, boxes, userEdges) {
    const m = matchBoss(answer, boxes);
    const map = m.map;
    const matched = new Set(Object.keys(map).map(function (uid) { return map[uid]; }));
    const unmatchedCards = answer.cards.filter(function (c) { return !matched.has(c.id); }).map(function (c) { return c.id; });

    const has = function (uid) { return Object.prototype.hasOwnProperty.call(map, uid); };
    const isNeutral = function (uid) { return Object.prototype.hasOwnProperty.call(m.neutral, uid); };
    const user = uniqueEdges(userEdges);
    const converted = user
      .filter(function (e) { return has(e[0]) && has(e[1]); })
      .map(function (e) { return [map[e[0]], map[e[1]]]; });
    const edges = gradeComponent({ edges: answer.edges }, converted);
    const expected = new Set(answer.edges.map(function (e) { return pairKey(e.from, e.to); }));
    const wrong = user.filter(function (e) {
      if (isNeutral(e[0]) || isNeutral(e[1])) return false;
      return !(has(e[0]) && has(e[1]) && expected.has(pairKey(map[e[0]], map[e[1]])));
    });

    return {
      got: matched.size + edges.got,
      of: answer.cards.length + answer.edges.length,
      missed: unmatchedCards.concat(edges.missed),
      wrong: wrong,
    };
  }

  function payload(missionId, result, text, hintsUsed, challenges, now) {
    const out = { id: missionId, submittedAt: now.toISOString(), got: result.got, of: result.of, missed: result.missed };
    if (result.wrong && result.wrong.length) out.wrong = result.wrong;
    out.text = text;
    out.hintsUsed = hintsUsed;
    out.challenges = challenges;
    return out;
  }

  return {
    KEY: KEY, encode: encode, decode: decode, toBase64: toBase64, fromBase64: fromBase64,
    gradeComponent: gradeComponent, gradeSwimlanes: gradeSwimlanes, gradeBreak: gradeBreak,
    matchLabels: matchLabels, matchBoss: matchBoss, gradeBoss: gradeBoss, payload: payload,
  };
});
