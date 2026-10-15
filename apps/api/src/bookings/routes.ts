import { Router } from 'express';
import type { Pool } from 'pg';
import { requireAuth, requireSameOrigin } from '../auth/middleware.js';
import { isUuid, paramId } from '../events/validation.js';

interface BookingRow {
  id: string;
  event_id: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface ApiBooking {
  id: string;
  eventId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function toApiBooking(row: BookingRow): ApiBooking {
  return {
    id: row.id,
    eventId: row.event_id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface BookingsRouterDeps {
  pool: Pool;
  frontendOrigin: string;
}

export function createBookingsRouter(deps: BookingsRouterDeps): Router {
  const { pool, frontendOrigin } = deps;
  const router = Router();
  const requireOrigin = requireSameOrigin(frontendOrigin);

  // Book one seat. The event row is locked first so two concurrent requests
  // for the last seat cannot both succeed; the partial unique index stays
  // as a backstop and maps to the same 409.
  router.post('/', requireAuth(pool), requireOrigin, async (req, res, next) => {
    try {
      const { event_id: eventId } = req.body as { event_id?: unknown };
      if (typeof eventId !== 'string' || !isUuid(eventId)) {
        res.status(400).json({ error: 'event_id must be a valid event id.' });
        return;
      }
      const userId = req.auth?.userId as string;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const locked = await client.query(
          'SELECT id, starts_at, total_seats FROM events WHERE id = $1 FOR UPDATE',
          [eventId],
        );
        if (locked.rowCount === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({ error: 'Event not found.' });
          return;
        }
        const event = locked.rows[0] as { starts_at: Date; total_seats: number };
        if (event.starts_at.getTime() <= Date.now()) {
          await client.query('ROLLBACK');
          res.status(409).json({ error: 'Past events cannot be booked.' });
          return;
        }
        const existing = await client.query(
          "SELECT id FROM bookings WHERE event_id = $1 AND user_id = $2 AND status = 'confirmed'",
          [eventId, userId],
        );
        if ((existing.rowCount ?? 0) > 0) {
          await client.query('ROLLBACK');
          res.status(409).json({ error: 'You already hold a confirmed booking for this event.' });
          return;
        }
        const counted = await client.query(
          "SELECT count(*) AS n FROM bookings WHERE event_id = $1 AND status = 'confirmed'",
          [eventId],
        );
        if (Number(counted.rows[0].n) >= event.total_seats) {
          await client.query('ROLLBACK');
          res.status(409).json({ error: 'Event is full.' });
          return;
        }
        const inserted = await client.query(
          `INSERT INTO bookings (user_id, event_id, status)
           VALUES ($1, $2, 'confirmed')
           RETURNING id, event_id, status, created_at, updated_at`,
          [userId, eventId],
        );
        await client.query('COMMIT');
        res.status(201).json({ booking: toApiBooking(inserted.rows[0] as BookingRow) });
      } catch (err) {
        await client.query('ROLLBACK');
        if ((err as { code?: string }).code === '23505') {
          res.status(409).json({ error: 'You already hold a confirmed booking for this event.' });
          return;
        }
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  });

  // The caller's own bookings, newest first, with the event facts needed
  // to display them (admin attendee lists stay on the admin endpoint).
  router.get('/mine', requireAuth(pool), async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT b.id, b.event_id, b.status, b.created_at, b.updated_at,
                e.title, e.starts_at, e.venue
         FROM bookings b JOIN events e ON e.id = b.event_id
         WHERE b.user_id = $1 ORDER BY b.created_at DESC`,
        [req.auth?.userId],
      );
      res.status(200).json({
        bookings: result.rows.map((row) => ({
          ...toApiBooking(row as BookingRow),
          event: {
            id: row.event_id as string,
            title: row.title as string,
            startsAt: (row.starts_at as Date).toISOString(),
            venue: row.venue as string,
          },
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // Cancelling flips the status and frees the seat; history is preserved.
  // No event lock is needed: cancellation only removes occupancy.
  router.post('/:id/cancel', requireAuth(pool), requireOrigin, async (req, res, next) => {
    try {
      const id = paramId(req.params.id);
      if (!isUuid(id)) {
        res.status(400).json({ error: 'Invalid booking id.' });
        return;
      }
      const found = await pool.query(
        `SELECT b.id, b.user_id, b.status, e.starts_at
         FROM bookings b JOIN events e ON e.id = b.event_id
         WHERE b.id = $1`,
        [id],
      );
      const row = found.rows[0] as
        { id: string; user_id: string; status: string; starts_at: Date } | undefined;
      if (!row) {
        res.status(404).json({ error: 'Booking not found.' });
        return;
      }
      if (row.user_id !== req.auth?.userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      if (row.status !== 'confirmed') {
        res.status(409).json({ error: 'Booking is already cancelled.' });
        return;
      }
      if (row.starts_at.getTime() <= Date.now()) {
        res.status(409).json({ error: 'Bookings for past events cannot be cancelled.' });
        return;
      }
      const updated = await pool.query(
        `UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = $1
         RETURNING id, event_id, status, created_at, updated_at`,
        [id],
      );
      res.status(200).json({ booking: toApiBooking(updated.rows[0] as BookingRow) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
