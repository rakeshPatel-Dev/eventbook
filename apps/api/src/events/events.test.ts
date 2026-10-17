import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import {
  api,
  createEvent,
  futureIso,
  pastIso,
  registerAdmin,
  registerUser,
  startTestServer,
  truncateAll,
  type TestServer,
} from '../test/helper.js';

const WORKSHOP = {
  title: 'React Workshop',
  description: 'Hands-on evening.',
  venue: 'Lalitpur Hub',
  starts_at: futureIso(14),
  total_seats: 3,
};

describe('events', () => {
  let ctx: TestServer;
  let pool: Pool;
  let adminCookie = '';
  let userCookie = '';

  before(async () => {
    ctx = await startTestServer();
    pool = ctx.pool;
  });

  after(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    adminCookie = await registerAdmin(pool, ctx.baseUrl, 'admin@test.local');
    userCookie = await registerUser(ctx.baseUrl, 'user@test.local');
  });

  it('lists upcoming events with search, pagination, and seats left', async () => {
    await createEvent(ctx.baseUrl, adminCookie, { ...WORKSHOP, title: 'Alpha Meetup' });
    await createEvent(ctx.baseUrl, adminCookie, { ...WORKSHOP, title: 'Beta Meetup' });
    await createEvent(ctx.baseUrl, adminCookie, {
      ...WORKSHOP,
      title: 'Old Gathering',
      starts_at: pastIso(30),
    });

    const searched = await api(ctx.baseUrl, '/api/events?search=alpha');
    assert.equal(searched.res.status, 200);
    assert.equal((searched.body?.events as unknown[]).length, 1);

    const paged = await api(ctx.baseUrl, '/api/events?limit=1&page=2');
    assert.equal(paged.res.status, 200);
    assert.equal((paged.body?.events as unknown[]).length, 1);
    assert.equal((paged.body?.pagination as { total: number }).total, 2);
    assert.equal((paged.body?.pagination as { totalPages: number }).totalPages, 2);

    // Past events stay out of the public list...
    const all = await api(ctx.baseUrl, '/api/events');
    assert.equal((all.body?.pagination as { total: number }).total, 2);
    // ...but remain fetchable by id.
    const pastId = (await pool.query("SELECT id FROM events WHERE title = 'Old Gathering'")).rows[0]
      .id as string;
    const detail = await api(ctx.baseUrl, `/api/events/${pastId}`);
    assert.equal(detail.res.status, 200);
  });

  it('computes seats left excluding cancelled bookings', async () => {
    const { id } = await createEvent(ctx.baseUrl, adminCookie, WORKSHOP);
    const booked = await api(
      ctx.baseUrl,
      '/api/bookings',
      { method: 'POST', body: JSON.stringify({ event_id: id }) },
      userCookie,
    );
    assert.equal(booked.res.status, 201);
    const bookingId = (booked.body?.booking as { id: string }).id;
    await api(ctx.baseUrl, `/api/bookings/${bookingId}/cancel`, { method: 'POST' }, userCookie);

    const detail = await api(ctx.baseUrl, `/api/events/${id}`);
    assert.equal((detail.body?.event as { seatsLeft: number }).seatsLeft, 3);
  });

  it('rejects event management by non-admins and strangers', async () => {
    const asUser = await api(
      ctx.baseUrl,
      '/api/events',
      { method: 'POST', body: JSON.stringify(WORKSHOP) },
      userCookie,
    );
    assert.equal(asUser.res.status, 403);
    const anonymous = await api(ctx.baseUrl, '/api/events', {
      method: 'POST',
      body: JSON.stringify(WORKSHOP),
    });
    assert.equal(anonymous.res.status, 401);
  });

  it('validates event input and ids', async () => {
    const empty = await api(
      ctx.baseUrl,
      '/api/events',
      { method: 'POST', body: JSON.stringify({ title: '  ', venue: 'Hall', total_seats: 0 }) },
      adminCookie,
    );
    assert.equal(empty.res.status, 400);
    const badId = await api(ctx.baseUrl, '/api/events/not-a-uuid');
    assert.equal(badId.res.status, 400);
    const missing = await api(ctx.baseUrl, '/api/events/00000000-0000-4000-8000-000000000000');
    assert.equal(missing.res.status, 404);
  });

  it('updates events but never below confirmed bookings', async () => {
    const { id } = await createEvent(ctx.baseUrl, adminCookie, { ...WORKSHOP, total_seats: 2 });
    await api(
      ctx.baseUrl,
      '/api/bookings',
      { method: 'POST', body: JSON.stringify({ event_id: id }) },
      userCookie,
    );
    await api(
      ctx.baseUrl,
      '/api/bookings',
      { method: 'POST', body: JSON.stringify({ event_id: id }) },
      adminCookie,
    );

    const tooLow = await api(
      ctx.baseUrl,
      `/api/events/${id}`,
      { method: 'PATCH', body: JSON.stringify({ total_seats: 1 }) },
      adminCookie,
    );
    assert.equal(tooLow.res.status, 409);
    const raised = await api(
      ctx.baseUrl,
      `/api/events/${id}`,
      { method: 'PATCH', body: JSON.stringify({ total_seats: 5, title: 'Renamed' }) },
      adminCookie,
    );
    assert.equal(raised.res.status, 200);
    assert.equal((raised.body?.event as { totalSeats: number }).totalSeats, 5);
    assert.equal((raised.body?.event as { seatsLeft: number }).seatsLeft, 3);
  });

  it('refuses to delete events with booking history', async () => {
    const { id: withHistory } = await createEvent(ctx.baseUrl, adminCookie, WORKSHOP);
    await api(
      ctx.baseUrl,
      '/api/bookings',
      { method: 'POST', body: JSON.stringify({ event_id: withHistory }) },
      userCookie,
    );
    const blocked = await api(
      ctx.baseUrl,
      `/api/events/${withHistory}`,
      { method: 'DELETE' },
      adminCookie,
    );
    assert.equal(blocked.res.status, 409);

    const { id: clean } = await createEvent(ctx.baseUrl, adminCookie, WORKSHOP);
    const removed = await api(
      ctx.baseUrl,
      `/api/events/${clean}`,
      { method: 'DELETE' },
      adminCookie,
    );
    assert.equal(removed.res.status, 200);
    const gone = await api(ctx.baseUrl, `/api/events/${clean}`);
    assert.equal(gone.res.status, 404);
  });

  it('shows confirmed attendees to admins only', async () => {
    const { id } = await createEvent(ctx.baseUrl, adminCookie, WORKSHOP);
    await api(
      ctx.baseUrl,
      '/api/bookings',
      { method: 'POST', body: JSON.stringify({ event_id: id }) },
      userCookie,
    );
    const asAdmin = await api(ctx.baseUrl, `/api/events/${id}/attendees`, {}, adminCookie);
    assert.equal(asAdmin.res.status, 200);
    assert.equal((asAdmin.body?.attendees as unknown[]).length, 1);
    assert.equal((asAdmin.body?.attendees as [{ email: string }])[0].email, 'user@test.local');
    const asUser = await api(ctx.baseUrl, `/api/events/${id}/attendees`, {}, userCookie);
    assert.equal(asUser.res.status, 403);
  });

  it('exposes scope=all to admins only', async () => {
    await createEvent(ctx.baseUrl, adminCookie, WORKSHOP);
    await createEvent(ctx.baseUrl, adminCookie, { ...WORKSHOP, starts_at: pastIso(30) });

    const asAdmin = await api(ctx.baseUrl, '/api/events?scope=all', {}, adminCookie);
    assert.equal(asAdmin.res.status, 200);
    assert.equal((asAdmin.body?.pagination as { total: number }).total, 2);

    const asUser = await api(ctx.baseUrl, '/api/events?scope=all', {}, userCookie);
    assert.equal(asUser.res.status, 403);
    const anonymous = await api(ctx.baseUrl, '/api/events?scope=all');
    assert.equal(anonymous.res.status, 401);
    const invalid = await api(ctx.baseUrl, '/api/events?scope=everything', {}, adminCookie);
    assert.equal(invalid.res.status, 400);
  });
});
