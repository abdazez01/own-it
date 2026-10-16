// Hand-written HTML sanitizer for screen copies. It tokenizes, never regex-replaces markup, and
// re-serializes only what the allowlist permits, so whatever the browser later parses is what was checked.
// Attribute values are entity-decoded, checked, then re-escaped; text keeps its entities but loses < and >.

const ALLOWED_TAGS = new Set(('div span p h1 h2 h3 h4 h5 h6 ul ol li a button input label select option textarea '
  + 'table thead tbody tr th td img header footer nav main section article aside form strong em small br hr').split(' '));
const VOID = new Set(['img', 'input', 'br', 'hr']);
// Dropped together with everything up to their closing tag.
const REMOVE = new Set(('script iframe object embed link meta base style noscript template svg math title head '
  + 'frameset frame applet xmp plaintext noembed noframes').split(' '));
const ALLOWED_ATTRS = new Set(['class', 'style', 'data-ownit', 'type', 'placeholder', 'value', 'disabled', 'checked',
  'selected', 'alt', 'role', 'colspan', 'rowspan', 'for', 'name']);
const MAX_IMG = 40 * 1024;
const DATA_IMG = /^data:image\/(png|svg\+xml|jpeg);base64,[A-Za-z0-9+/]*={0,2}$/i;

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', colon: ':', semi: ';', lpar: '(', rpar: ')',
  sol: '/', bsol: '\\', Tab: '\t', NewLine: '\n', comma: ',', period: '.', num: '#', percnt: '%', equals: '=', excl: '!',
  quest: '?', commat: '@', lowbar: '_', hyphen: '-', plus: '+', ast: '*', lsqb: '[', rsqb: ']', lbrace: '{', rbrace: '}' };

export function decodeEntities(s) {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);?/g, (m, body) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '�';
    }
    return Object.hasOwn(NAMED, body) ? NAMED[body] : m;
  });
}

const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escText = (s) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

// True when a CSS string is safe to keep. Backslash escapes are refused outright (they can spell url( or javascript:).
export function cssIsSafe(css) {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/[\u0000- \u007f]+/g, ' ').toLowerCase();
  if (/\\|<|\/\*/.test(flat)) return false;
  return !/url\s*\(|@import|expression\s*\(|javascript:|vbscript:|behaviou?r\s*:|-moz-binding|image-set\s*\(|image\s*\(|src\s*\(|element\s*\(|cross-fade\s*\(|paint\s*\(/.test(flat);
}

const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
const isLetter = (c) => /[A-Za-z]/.test(c || '');

// Parses attributes starting at i, the way a browser tokenizer does. closed=false means the tag never ended.
function parseAttrs(src, i) {
  const attrs = [];
  const n = src.length;
  for (;;) {
    while (i < n && (isSpace(src[i]) || src[i] === '/')) i++;
    if (i >= n) return { attrs, end: n, closed: false };
    if (src[i] === '>') return { attrs, end: i + 1, closed: true };
    let j = i + 1;
    while (j < n && !isSpace(src[j]) && src[j] !== '/' && src[j] !== '>' && src[j] !== '=') j++;
    const name = src.slice(i, j).toLowerCase();
    i = j;
    while (i < n && isSpace(src[i])) i++;
    let value = null;
    if (src[i] === '=') {
      i++;
      while (i < n && isSpace(src[i])) i++;
      if (src[i] === '"' || src[i] === "'") {
        const close = src.indexOf(src[i], i + 1);
        if (close < 0) return { attrs, end: n, closed: false };
        value = src.slice(i + 1, close);
        i = close + 1;
      } else {
        let k = i;
        while (k < n && !isSpace(src[k]) && src[k] !== '>') k++;
        value = src.slice(i, k);
        i = k;
      }
    }
    attrs.push([name, value]);
  }
}

export function sanitize(input) {
  const src = String(input).replace(/\0/g, '');
  const n = src.length;
  const dropped = new Set();
  const stack = [];
  let out = '';
  let i = 0;
  let styleSeen = false;

  const keepAttr = (tag, name, raw) => {
    const value = decodeEntities(raw ?? '');
    if (name === 'href' && tag === 'a') return ' href="#"';
    if (name === 'src' && tag === 'img') {
      if (DATA_IMG.test(value) && value.length <= MAX_IMG) return ` src="${escAttr(value)}"`;
      dropped.add('img src');
      return '';
    }
    if (!ALLOWED_ATTRS.has(name) && !/^aria-[a-z0-9-]+$/.test(name)) { dropped.add(name); return ''; }
    if (name === 'style' && !cssIsSafe(value)) { dropped.add('style attribute'); return ''; }
    return ` ${name}="${escAttr(value)}"`;
  };

  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { out += escText(src.slice(i)); break; }
    if (lt > i) out += escText(src.slice(i, lt));
    i = lt;
    const next = src[i + 1];

    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (next === '!' || next === '?') {
      const end = src.indexOf('>', i);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const closing = next === '/';
    if (!(isLetter(next) || (closing && isLetter(src[i + 2])))) { out += '&lt;'; i++; continue; }

    let j = i + (closing ? 2 : 1);
    const nameStart = j;
    while (j < n && !isSpace(src[j]) && src[j] !== '/' && src[j] !== '>') j++;
    const tag = src.slice(nameStart, j).toLowerCase();
    const { attrs, end, closed } = parseAttrs(src, j);
    if (!closed) { dropped.add('unterminated tag'); break; }
    i = end;

    if (closing) {
      const at = stack.lastIndexOf(tag);
      if (at >= 0) { while (stack.length > at) out += `</${stack.pop()}>`; }
      continue;
    }
    if (REMOVE.has(tag)) {
      const close = new RegExp(`</${tag}(?=[\\s/>])`, 'i');
      const m = close.exec(src.slice(i));
      const css = m ? src.slice(i, i + m.index) : src.slice(i);
      if (tag === 'style' && !styleSeen && out.trim() === '' && m && cssIsSafe(css)) {
        out += `<style>${css}</style>`;
      } else {
        dropped.add(tag);
      }
      if (tag === 'style') styleSeen = true;
      i = m ? i + m.index : n;
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) { dropped.add(tag); continue; }

    const seen = new Set();
    let html = `<${tag}`;
    for (const [name, raw] of attrs) {
      if (seen.has(name)) continue;
      seen.add(name);
      html += keepAttr(tag, name, raw);
    }
    out += html + '>';
    if (VOID.has(tag)) continue;
    if (tag === 'textarea') {
      const m = /<\/textarea(?=[\s/>])/i.exec(src.slice(i));
      const stop = m ? i + m.index : n;
      out += escText(src.slice(i, stop));
      i = stop;
    }
    stack.push(tag);
  }
  while (stack.length) out += `</${stack.pop()}>`;
  return { html: out, dropped: [...dropped] };
}
