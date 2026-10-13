import { Request, Response, NextFunction } from 'express';

export type Role = 'driver' | 'manager' | 'admin';

// Roles arrive as a header set by the API gateway in front of this service.
export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    const actual = req.header('x-user-role');
    if (actual !== role && actual !== 'admin') {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}
