import { Trip, Lock, TripStatus } from './models/trip';

export const trips = new Map<string, Trip>([
  ['t1', { id: 't1', driverId: 'd1', lockId: 'l1', status: TripStatus.ACTIVE }],
  ['t2', { id: 't2', driverId: 'd1', lockId: 'l2', status: TripStatus.COMPLETED }],
]);

export const locks = new Map<string, Lock>([
  ['l1', { id: 'l1', tripId: 't1', cableState: 'locked' }],
  ['l2', { id: 'l2', tripId: 't2', cableState: 'locked' }],
]);
