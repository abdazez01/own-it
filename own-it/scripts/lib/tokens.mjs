export function estimate(...parts) {
  const chars = parts.reduce((n, p) => n + (typeof p === 'string' ? p : JSON.stringify(p) ?? '').length, 0);
  return Math.ceil(chars / 4);
}
