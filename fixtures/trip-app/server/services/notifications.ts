export interface Notification {
  to: 'manager' | 'driver';
  tripId: string;
  message: string;
}

export const outbox: Notification[] = [];

export function notifyManager(tripId: string) {
  outbox.push({ to: 'manager', tripId, message: `Driver asked to cancel trip ${tripId}` });
}

export function notifyDriver(tripId: string, outcome: 'approved' | 'rejected') {
  outbox.push({ to: 'driver', tripId, message: `Your cancel request for trip ${tripId} was ${outcome}` });
}
