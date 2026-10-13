import { Router } from 'express';
import { requireRole } from '../middleware/auth';
import { trips } from '../store';
import { TripStatus } from '../models/trip';
import { requestCancel, approveCancel, rejectCancel, pendingCancels } from '../services/approvals';

const router = Router();

router.get('/trips', requireRole('manager'), (req, res) => {
  res.json(pendingCancels([...trips.values()]));
});

router.get('/trips/:id', (req, res) => {
  const trip = trips.get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'not found' });
  res.json(trip);
});

router.post('/trips/:id/cancel', requireRole('driver'), (req, res) => {
  const trip = trips.get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'not found' });
  if (trip.status !== TripStatus.ACTIVE) {
    return res.status(409).json({ error: 'only active trips can be cancelled' });
  }
  requestCancel(trip); // emits trip.cancel_requested
  res.json(trip);
});

router.post('/trips/:id/cancel/approve', requireRole('manager'), (req, res) => {
  const trip = trips.get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'not found' });
  approveCancel(trip);
  res.json(trip);
});

router.post('/trips/:id/cancel/reject', requireRole('manager'), (req, res) => {
  const trip = trips.get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'not found' });
  if (trip.status !== TripStatus.CANCEL_PENDING) {
    return res.status(409).json({ error: 'no pending cancel request' });
  }
  rejectCancel(trip);
  res.json(trip);
});

export default router;
