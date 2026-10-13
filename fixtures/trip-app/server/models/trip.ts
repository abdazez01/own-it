export enum TripStatus {
  REQUESTED = 'requested',
  ACTIVE = 'active',
  CANCEL_PENDING = 'cancel_pending',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export interface Trip {
  id: string;
  driverId: string;
  lockId: string;
  status: TripStatus;
  cancelRequestedAt?: number; // epoch ms, set when a driver asks to cancel
}

export interface Lock {
  id: string;
  tripId: string;
  // "Cable" is the steel cable seal on the cargo lock. It stays 'locked'
  // while cargo is in transit and is 'released' once the driver cuts it
  // at the destination (or after a cancelled trip).
  cableState: 'locked' | 'released';
}
