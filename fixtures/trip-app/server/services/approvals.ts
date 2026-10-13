import { Trip, TripStatus } from '../models/trip';
import { notifyManager, notifyDriver } from './notifications';

export function requestCancel(trip: Trip) {
  trip.status = TripStatus.CANCEL_PENDING;
  trip.cancelRequestedAt = Date.now();
  notifyManager(trip.id);
}

export function approveCancel(trip: Trip) {
  trip.status = TripStatus.CANCELLED;
  notifyDriver(trip.id, 'approved');
}

export function rejectCancel(trip: Trip) {
  trip.status = TripStatus.ACTIVE;
  trip.cancelRequestedAt = undefined;
  notifyDriver(trip.id, 'rejected');
}

export function pendingCancels(trips: Trip[]): Trip[] {
  return trips.filter((t) => t.status === TripStatus.CANCEL_PENDING);
}
