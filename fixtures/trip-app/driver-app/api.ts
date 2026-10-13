const headers = { 'x-user-role': 'driver' };

async function post(path: string) {
  const res = await fetch(path, { method: 'POST', headers });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

export const getTrip = (id: string) => fetch(`/trips/${id}`, { headers }).then((r) => r.json());
export const getLock = (id: string) => fetch(`/locks/${id}`, { headers }).then((r) => r.json());
export const cancelTrip = (id: string) => post(`/trips/${id}/cancel`);
export const releaseCable = (lockId: string) => post(`/locks/${lockId}/release-cable`);
