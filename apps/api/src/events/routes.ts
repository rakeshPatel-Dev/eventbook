import { Router } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Pool } from 'pg';
import { requireAdmin, requireAuth, requireSameOrigin } from '../auth/middleware.js';
import { isUuid, paramId, parsePagination, validateEventBody } from './validation.js';

interface EventRow {
  id: string;
  title: string;
  description: string;
  venue: string;
  starts_at: Date;
  total_seats: number;
  seats_left: string;
  created_at: Date;
  updated_at: Date;
}

export interface ApiEvent {
  id: string;
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  totalSeats: number;
  seatsLeft: number;
  createdAt: string;
  updatedAt: string;
}

function toApiEvent(row: EventRow): ApiEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    venue: row.venue,
    startsAt: row.starts_at.toISOString(),
    totalSeats: row.total_seats,
    seatsLeft: Number(row.seats_left),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const EVENT_COLUMNS = `e.id, e.title, e.description, e.venue, e.starts_at,
  e.total_seats, e.created_at, e.updated_at,
  (e.total_seats - COUNT(b.id) FILTER (WHERE b.status = 'confirmed'))::int AS seats_left`;

// Occupied seats are derived, never stored: total minus confirmed bookings.
// Cancelled rows never count.
const FROM_EVENTS_WITH_SEATS = `FROM events e LEFT JOIN bookings b ON b.event_id = e.id`;

export interface EventsRouterDeps {
  pool: Pool;
  frontendOrigin: string;
}

// The public list shows upcoming events. Admins pass ?scope=all to manage
// everything including the past; any other scope value is rejected.
function requireAdminScope(pool: Pool): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const scope = req.query.scope;
    if (scope === undefined) {
      next();
      return;
    }
    if (scope !== 'all') {
      res.status(400).json({ error: "scope must be 'all'." });
      return;
    }
    requireAuth(pool)(req, res, (authErr: unknown) => {
      if (authErr) {
        next(authErr);
        return;
      }
      requireAdmin()(req, res, next);
    });
  };
}

export function createEventsRouter(deps: EventsRouterDeps): Router {
  const { pool, frontendOrigin } = deps;
  const router = Router();
  const requireOrigin = requireSameOrigin(frontendOrigin);

  // Public: upcoming events only, searchable by title, server-paginated.
  // ?past_only=true flips to previous events, newest first (also public).
  router.get('/', requireAdminScope(pool), async (req, res, next) => {
    try {
      const pagination = parsePagination(req.query);
      if (pagination.error) {
        res.status(400).json({ error: pagination.error });
        return;
      }
      const pastOnly = req.query.past_only !== undefined;
      if (pastOnly && req.query.past_only !== 'true') {
        res.status(400).json({ error: "past_only must be 'true'." });
        return;
      }
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const upcomingOnly = req.query.scope !== 'all';
      const where: string[] = [];
      if (upcomingOnly) {
        where.push(pastOnly ? 'e.starts_at <= now()' : 'e.starts_at > now()');
      }
      const params: unknown[] = [];
      if (search) {
        params.push(`%${search}%`);
        where.push(`e.title ILIKE $${params.length}`);
      }
      const totalResult = await pool.query(
        `SELECT count(*) AS total FROM events e${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`,
        params,
      );
      const total = Number(totalResult.rows[0].total);
      const offset = ((pagination.page as number) - 1) * (pagination.limit as number);
      const listResult = await pool.query(
        `SELECT ${EVENT_COLUMNS} ${FROM_EVENTS_WITH_SEATS}
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         GROUP BY e.id ORDER BY e.starts_at ${pastOnly ? 'DESC' : 'ASC'}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pagination.limit, offset],
      );
      res.status(200).json({
        events: (listResult.rows as EventRow[]).map(toApiEvent),
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / (pagination.limit as number)),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Public: any single event, including past ones.
  router.get('/:id', async (req, res, next) => {
    try {
      const id = paramId(req.params.id);
      if (!isUuid(id)) {
        res.status(400).json({ error: 'Invalid event id.' });
        return;
      }
      const result = await pool.query(
        `SELECT ${EVENT_COLUMNS} ${FROM_EVENTS_WITH_SEATS}
         WHERE e.id = $1 GROUP BY e.id`,
        [id],
      );
      const row = result.rows[0] as EventRow | undefined;
      if (!row) {
        res.status(404).json({ error: 'Event not found.' });
        return;
      }
      res.status(200).json({ event: toApiEvent(row) });
    } catch (err) {
      next(err);
    }
  });

  // Admin: who holds confirmed seats, oldest booking first.
  router.get('/:id/attendees', requireAuth(pool), requireAdmin(), async (req, res, next) => {
    try {
      const id = paramId(req.params.id);
      if (!isUuid(id)) {
        res.status(400).json({ error: 'Invalid event id.' });
        return;
      }
      const eventResult = await pool.query('SELECT id FROM events WHERE id = $1', [id]);
      if (eventResult.rowCount === 0) {
        res.status(404).json({ error: 'Event not found.' });
        return;
      }
      const result = await pool.query(
        `SELECT b.id, b.user_id, u.email, b.created_at
         FROM bookings b JOIN users u ON u.id = b.user_id
         WHERE b.event_id = $1 AND b.status = 'confirmed'
         ORDER BY b.created_at ASC`,
        [id],
      );
      res.status(200).json({
        attendees: result.rows.map((row) => ({
          id: row.id as string,
          userId: row.user_id as string,
          email: row.email as string,
          createdAt: (row.created_at as Date).toISOString(),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requireAuth(pool), requireAdmin(), requireOrigin, async (req, res, next) => {
    try {
      const { error, value } = validateEventBody(req.body as Record<string, unknown>, false);
      if (error || !value) {
        res.status(400).json({ error: error ?? 'Invalid event.' });
        return;
      }
      const result = await pool.query(
        `INSERT INTO events (title, description, venue, starts_at, total_seats)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, title, description, venue, starts_at, total_seats, created_at, updated_at,
           total_seats AS seats_left`,
        [value.title, value.description ?? '', value.venue, value.startsAt, value.totalSeats],
      );
      res.status(201).json({ event: toApiEvent(result.rows[0] as EventRow) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', requireAuth(pool), requireAdmin(), requireOrigin, async (req, res, next) => {
    try {
      const id = paramId(req.params.id);
      if (!isUuid(id)) {
        res.status(400).json({ error: 'Invalid event id.' });
        return;
      }
      const { error, value } = validateEventBody(req.body as Record<string, unknown>, true);
      if (error || !value) {
        res.status(400).json({ error: error ?? 'Invalid event.' });
        return;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const locked = await client.query(
          'SELECT id, total_seats FROM events WHERE id = $1 FOR UPDATE',
          [id],
        );
        if (locked.rowCount === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({ error: 'Event not found.' });
          return;
        }
        if (value.totalSeats !== undefined) {
          const counted = await client.query(
            "SELECT count(*) AS n FROM bookings WHERE event_id = $1 AND status = 'confirmed'",
            [id],
          );
          if (value.totalSeats < Number(counted.rows[0].n)) {
            await client.query('ROLLBACK');
            res.status(409).json({ error: 'total_seats cannot be below the confirmed bookings.' });
            return;
          }
        }
        const sets: string[] = [];
        const params: unknown[] = [];
        const push = (column: string, val: unknown) => {
          params.push(val);
          sets.push(`${column} = $${params.length}`);
        };
        if (value.title !== undefined) push('title', value.title);
        if (value.description !== undefined) push('description', value.description);
        if (value.venue !== undefined) push('venue', value.venue);
        if (value.startsAt !== undefined) push('starts_at', value.startsAt);
        if (value.totalSeats !== undefined) push('total_seats', value.totalSeats);
        params.push(id);
        const updated = await client.query(
          `UPDATE events SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}
           RETURNING id, title, description, venue, starts_at, total_seats, created_at, updated_at,
             total_seats - (SELECT count(*) FROM bookings
               WHERE event_id = events.id AND status = 'confirmed')::int AS seats_left`,
          params,
        );
        await client.query('COMMIT');
        res.status(200).json({ event: toApiEvent(updated.rows[0] as EventRow) });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  });

  router.delete(
    '/:id',
    requireAuth(pool),
    requireAdmin(),
    requireOrigin,
    async (req, res, next) => {
      try {
        const id = paramId(req.params.id);
        if (!isUuid(id)) {
          res.status(400).json({ error: 'Invalid event id.' });
          return;
        }
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const locked = await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [id]);
          if (locked.rowCount === 0) {
            await client.query('ROLLBACK');
            res.status(404).json({ error: 'Event not found.' });
            return;
          }
          const used = await client.query(
            'SELECT count(*) AS n FROM bookings WHERE event_id = $1',
            [id],
          );
          if (Number(used.rows[0].n) > 0) {
            await client.query('ROLLBACK');
            res.status(409).json({ error: 'Event has booking history and cannot be deleted.' });
            return;
          }
          await client.query('DELETE FROM events WHERE id = $1', [id]);
          await client.query('COMMIT');
          res.status(200).json({ status: 'ok' });
        } catch (err) {
          await client.query('ROLLBACK');
          // Final backstop if a booking slipped in concurrently.
          if ((err as { code?: string }).code === '23503') {
            res.status(409).json({ error: 'Event has booking history and cannot be deleted.' });
            return;
          }
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
