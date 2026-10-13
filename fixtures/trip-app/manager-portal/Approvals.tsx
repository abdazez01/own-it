import React, { useEffect, useState } from 'react';

const headers = { 'x-user-role': 'manager' };

async function decide(id: string, decision: 'approve' | 'reject') {
  await fetch(`/trips/${id}/cancel/${decision}`, { method: 'POST', headers });
}

export default function Approvals() {
  const [trips, setTrips] = useState<any[]>([]);

  const load = () => fetch('/trips', { headers }).then((r) => r.json()).then(setTrips);

  useEffect(() => { load(); }, []);

  return (
    <main>
      <h1>Pending cancellations</h1>
      {trips.map((t) => (
        <section key={t.id}>
          <span>Trip {t.id} (driver {t.driverId})</span>
          <button onClick={() => decide(t.id, 'approve').then(load)}>Approve cancel</button>
          <button onClick={() => decide(t.id, 'reject').then(load)}>Reject</button>
        </section>
      ))}
    </main>
  );
}
