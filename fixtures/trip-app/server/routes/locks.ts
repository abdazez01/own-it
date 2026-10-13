import { Router } from 'express';
import { requireRole } from '../middleware/auth';
import { trips, locks } from '../store';
import { TripStatus } from '../models/trip';

const router = Router();

router.get('/locks/:id', (req, res) => {
  const lock = locks.get(req.params.id);
  if (!lock) return res.status(404).json({ error: 'not found' });
  res.json(lock);
});

router.post('/locks/:id/release-cable', requireRole('driver'), (req, res) => {
  const lock = locks.get(req.params.id);
  if (!lock) return res.status(404).json({ error: 'not found' });
  const trip = trips.get(lock.tripId);
  if (!trip || (trip.status !== TripStatus.CANCELLED && trip.status !== TripStatus.COMPLETED)) {
    return res.status(409).json({ error: 'trip must be cancelled or completed first' });
  }
  lock.cableState = 'released';
  res.json(lock);
});

export default router;
