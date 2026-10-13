import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getTrip, getLock, cancelTrip, releaseCable } from './api';

export default function TripScreen() {
  const { id } = useParams();
  const [trip, setTrip] = useState<any>(null);
  const [lock, setLock] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getTrip(id!).then((t) => {
      setTrip(t);
      getLock(t.lockId).then(setLock);
    });
  }, [id]);

  async function onCancel() {
    try { setTrip(await cancelTrip(id!)); } catch (e: any) { setError(e.message); }
  }

  async function onRelease() {
    try { setLock(await releaseCable(trip.lockId)); } catch (e: any) { setError(e.message); }
  }

  if (!trip) return <p>Loading trip...</p>;
  return (
    <main>
      <h1>Trip {trip.id}</h1>
      <p>Status: {trip.status}</p>
      <p>Cable: {lock?.cableState}</p>
      {error && <p role="alert">{error}</p>}
      <button onClick={onCancel}>Cancel Trip</button>
      <button onClick={onRelease}>Release cable</button>
    </main>
  );
}
