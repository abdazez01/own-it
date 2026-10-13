export function check(v, s, at = '') {
  const errs = [];
  const p = (k) => (at ? `${at}.${k}` : k);
  const isType = { object: (x) => x && typeof x === 'object' && !Array.isArray(x), array: Array.isArray,
    string: (x) => typeof x === 'string', number: (x) => typeof x === 'number' && Number.isFinite(x),
    boolean: (x) => typeof x === 'boolean', any: () => true };
  if (!isType[s.type](v)) return [`${at || '(root)'}: expected ${s.type}`];
  if (s.enum && !s.enum.includes(v)) errs.push(`${at}: expected one of ${s.enum.join(',')}`);
  if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${at}: does not match ${s.pattern}`);
  if (s.type === 'string' && s.max !== undefined && v.length > s.max) errs.push(`${at}: at most ${s.max} chars`);
  if (s.type === 'number' && s.min !== undefined && v < s.min) errs.push(`${at}: below ${s.min}`);
  if (s.type === 'array') {
    if (s.min !== undefined && v.length < s.min) errs.push(`${at}: at least ${s.min} items`);
    if (s.max !== undefined && v.length > s.max) errs.push(`${at}: at most ${s.max} items`);
    if (s.items) v.forEach((x, i) => errs.push(...check(x, s.items, `${at}[${i}]`)));
  }
  if (s.type === 'object') {
    for (const k of s.required || []) if (v[k] === undefined) errs.push(`${p(k)}: required`);
    for (const [k, sub] of Object.entries(s.props || {})) if (v[k] !== undefined) errs.push(...check(v[k], sub, p(k)));
  }
  return errs;
}

const str = { type: 'string' };
const ids = { type: 'array', items: str };
export const ITEM = { type: 'object', required: ['id', 'k', 'ref', 'conf'], props: {
  id: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,24}$' },
  k: { type: 'string', enum: ['surface', 'component', 'edge', 'actor', 'role', 'permission', 'state', 'transition', 'flow', 'decision', 'failure', 'term'] },
  label: str, actor: str, from: str, to: str, by: str, card: str, threat: str, role: str, action: str,
  steps: { type: 'array', items: ids },
  ref: { type: 'string', pattern: '^[^:]+:\\d+$' },
  conf: { type: 'string', enum: ['high', 'medium', 'low'] },
  outside: { type: 'boolean' } } };
export const EXTRACTION = { type: 'object', required: ['zone', 'files', 'items'], props: {
  zone: str, files: ids, items: { type: 'array', items: ITEM, max: 80 } } };
export const ZONES = { type: 'object', required: ['zones'], props: { zones: { type: 'array', min: 1, items: {
  type: 'object', required: ['id', 'name', 'paths'], props: {
    id: { type: 'string', pattern: '^[a-z0-9-]{1,24}$' }, name: str, paths: { type: 'array', min: 1, items: str } } } } } };
export const RECIPE = { type: 'object', required: ['mode', 'missions'], props: {
  mode: { type: 'string', enum: ['practice', 'exam'] },
  missions: { type: 'array', min: 1, max: 8, items: { type: 'object', required: ['zone', 'rung', 'board', 'brief'], props: {
    zone: str, rung: { type: 'string', enum: ['map', 'trace', 'break', 'boss'] },
    board: { type: 'string', enum: ['component', 'swimlanes'] },
    brief: { type: 'string', max: 300 }, cards: { type: 'array', items: str, max: 15 },
    flow: str, threats: ids, refresh: { type: 'boolean' },
    pins: { type: 'array', max: 3, items: { type: 'object', required: ['card', 'q'], props: { card: str, q: { type: 'string', max: 160 } } } } } } } } };
export const ANSWER = { type: 'object', required: ['id', 'submittedAt', 'got', 'of', 'missed', 'text', 'hintsUsed'], props: {
  id: str, submittedAt: str, got: { type: 'number', min: 0 }, of: { type: 'number', min: 0 },
  missed: ids, wrong: { type: 'array', items: { type: 'any' } }, text: { type: 'object' },
  hintsUsed: { type: 'number', min: 0 }, challenges: ids } };
