// Minimal DOM for running the classic engine scripts in node vm. Just enough for tests; not a browser.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'own-it', 'assets', 'engine');

class FakeEvent {
  constructor(type, init = {}) { Object.assign(this, { bubbles: true, defaultPrevented: false }, init, { type }); }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.bubbles = false; }
}

function parseSel(sel) {
  const out = { tag: null, classes: [], attrs: [] };
  const re = /^([a-zA-Z][\w-]*)|\.([\w-]+)|\[([\w-]+)(?:="?([^\]"]*)"?)?\]/g;
  let m;
  while ((m = re.exec(sel))) {
    if (m[1]) out.tag = m[1].toLowerCase();
    else if (m[2]) out.classes.push(m[2]);
    else out.attrs.push([m[3], m[4]]);
  }
  return out;
}

export class FakeElement {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this._attrs = new Map();
    this._listeners = new Map();
    this._text = '';
    this.style = {};
    this.dataset = {};
    this.offsetLeft = 0; this.offsetWidth = 0; this.disabled = false;
    const self = this;
    const classes = () => (self._attrs.get('class') || '').split(/\s+/).filter(Boolean);
    this.classList = {
      add: (...c) => self._attrs.set('class', [...new Set([...classes(), ...c])].join(' ')),
      remove: (...c) => self._attrs.set('class', classes().filter((x) => !c.includes(x)).join(' ')),
      contains: (c) => classes().includes(c),
      toggle: (c) => (classes().includes(c) ? self.classList.remove(c) : self.classList.add(c)),
    };
  }
  get className() { return this._attrs.get('class') || ''; }
  set className(v) { this._attrs.set('class', v); }
  setAttribute(k, v) { this._attrs.set(k, String(v)); }
  getAttribute(k) { return this._attrs.has(k) ? this._attrs.get(k) : null; }
  hasAttribute(k) { return this._attrs.has(k); }
  removeAttribute(k) { this._attrs.delete(k); }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this._text = String(v); }
  addEventListener(t, f) { (this._listeners.get(t) || this._listeners.set(t, []).get(t)).push(f); }
  removeEventListener(t, f) { const l = this._listeners.get(t) || []; const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); }
  dispatchEvent(ev) {
    if (!ev.target) ev.target = this;
    ev.currentTarget = this;
    for (const f of [...(this._listeners.get(ev.type) || [])]) f.call(this, ev);
    if (ev.bubbles !== false) {
      if (this.parentNode) this.parentNode.dispatchEvent(ev);
      else if (this.ownerDocument && this !== this.ownerDocument) this.ownerDocument.dispatchEvent(ev);
    }
    return !ev.defaultPrevented;
  }
  click() { this.dispatchEvent(new FakeEvent('click')); }
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 40 }; }
  matches(sel) {
    const p = parseSel(sel);
    if (p.tag && p.tag !== this.tagName.toLowerCase()) return false;
    if (!p.classes.every((c) => this.classList.contains(c))) return false;
    return p.attrs.every(([k, v]) => (v === undefined ? this.hasAttribute(k) : this.getAttribute(k) === v));
  }
  closest(sel) {
    const alts = sel.split(',').map((s) => s.trim());
    for (let n = this; n && n.matches; n = n.parentNode) if (alts.some((a) => n.matches(a))) return n;
    return null;
  }
  querySelectorAll(sel) {
    const alts = sel.split(',').map((s) => s.trim());
    const out = [];
    const walk = (n) => { for (const c of n.children) { if (alts.some((a) => c.matches(a))) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

export function createEnv({ search = '', fetch, reduced = false } = {}) {
  const doc = {};
  const env = { document: doc };
  Object.assign(doc, {
    activeElement: null,
    _listeners: new Map(),
    createElement: (t) => new FakeElement(t, doc),
    createElementNS: (_ns, t) => new FakeElement(t, doc),
    getElementById: (id) => doc.documentElement.querySelectorAll('div').find((e) => e.getAttribute('id') === id) || null,
    addEventListener: FakeElement.prototype.addEventListener,
    dispatchEvent(ev) {
      if (!ev.target) ev.target = doc;
      for (const f of [...(doc._listeners.get(ev.type) || [])]) f.call(doc, ev);
    },
  });
  doc.documentElement = new FakeElement('html', doc);
  doc.head = doc.documentElement.appendChild(new FakeElement('head', doc));
  doc.body = doc.documentElement.appendChild(new FakeElement('body', doc));
  doc.querySelectorAll = (s) => doc.documentElement.querySelectorAll(s);

  const win = {
    document: doc, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    location: { search, href: 'http://127.0.0.1/game.html' + search },
    matchMedia: (q) => ({ matches: reduced && /reduce/.test(q) }),
    addEventListener() {}, requestAnimationFrame: (f) => setTimeout(() => f(0), 0),
    performance: { now: () => Date.now() },
    fetch, navigator: { clipboard: { writeText: async () => {} } },
  };
  win.window = win;
  const ctx = vm.createContext(Object.assign(win, {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, Map, Set, Array, Object, JSON, Math,
    Date, Error, String, Number, TextEncoder, btoa, URL, Blob,
  }));
  env.window = win;
  env.ctx = ctx;
  env.event = (type, init) => new FakeEvent(type, init);
  env.load = (...files) => files.forEach((f) => vm.runInContext(readFileSync(join(ENGINE, f), 'utf8'), ctx, { filename: f }));
  env.OwnIt = () => win.OwnIt;
  return env;
}

export const ENGINE_DIR = ENGINE;
