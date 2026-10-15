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

const CONCERT = {
  title: 'Evening Concert',
  description: 'Live music.',
  venue: 'Lakeside Stage',
  starts_at: futureIso(30),
  total_seats: 50,
};

describe('bookings', () => {
  let ctx: TestServer;
  let pool: Pool;
  let adminCookie = '';
  let userCookie = '';
  let otherCookie = '';

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
    otherCookie = await registerUser(ctx.baseUrl, 'other@test.local');
  });

  it('books a seat and lists it under my bookings', async () => {
    const { id } = await createEvent(ctx.baseUrl, adminCookie, CONCERT);
    const booked = await api(
      ctx.baseUrl,
      '/api/bookings',
      { method: 'POST', body: JSON.stringify({ event_id: id }) },
      userCookie,
    );
    assert.equal(booked.res.status, 201);
    assert.equal((booked.body?.booking as { status: string }).status, 'confirmed');

    const mine = await api(ctx.baseUrl, '/api/bookings/mine', {}, userCookie);
    assert.equal(mine.res.status, 200);
    assert.equal((mine.body?.bookings as unknown[]).length, 1);
    const theirs = await api(ctx.baseUrl, '/api/bookings/mine', {}, otherCookie);
    assert.equal((theirs.body?.bookings as unknown[]).length, 0);
  });

  it('rejects double booking but allows rebooking after cancellation', async () => {
    const { id } = await createEvent(ctx.baseUrl, adminCookie, CONCERT);
    assert.equal(
      (
        await api(
          ctx.baseUrl,
          '/api/bookings',
          { method: 'POST', body: JSON.stringify({ event_id: id }) },
          userCookie,
        )
      ).res.status,
      201,
    );
    const twice = await api(
      ctx.baseUrl,
      '/api/bookings',
      { method: 'POST', body: JSON.stringify({ event_id: id }) },
      userCookie,
    );
    assert.equal(twice.res.status, 409);

    const bookingId = (await pool.query("SELECT id FROM bookings WHERE status = 'confirmed'"))
      .rows[0].id as string;
    const cancelled = await api(
      ctx.baseUrl,
      `/api/bookings/${bookingId}/cancel`,
      { method: 'POST' },
      userCookie,
    );
    assert.equal(cancelled.res.status, 200);
    assert.equal((cancelled.body?.booking as { status: string }).status, 'cancelled');

    const rebooked = await api(
      ctx.baseUrl,
      '/api/bookings',
      { method: 'POST', body: JSON.stringify({ event_id: id }) },
      userCookie,
    );
    assert.equal(rebooked.res.status, 201);
  });

  it('never overbooks, even for the last seat at once', async () => {
    const { id } = await createEvent(ctx.baseUrl, adminCookie, { ...CONCERT, total_seats: 1 });
    const [first, second] = await Promise.all([
      api(
        ctx.baseUrl,
        '/api/bookings',
        { method: 'POST', body: JSON.stringify({ event_id: id }) },
        userCookie,
      ),
      api(
        ctx.baseUrl,
        '/api/bookings',
        { method: 'POST', body: JSON.stringify({ event_id: id }) },
        otherCookie,
      ),
    ]);
    assert.deepEqual([first.res.status, second.res.status].sort(), [201, 409]);
    const confirmed = await pool.query(
      "SELECT count(*) AS n FROM bookings WHERE event_id = $1 AND status = 'confirmed'",
      [id],
    );
    assert.equal(confirmed.rows[0].n, '1');
  });

  it('rejects booking past events and cancelling their bookings', async () => {
    const past = await createEvent(ctx.baseUrl, adminCookie, { ...CONCERT, starts_at: pastIso(5) });
    const bookingAttempt = await api(
      ctx.baseUrl,
      '/api/bookings',
      { method: 'POST', body: JSON.stringify({ event_id: past.id }) },
      userCookie,
    );
    assert.equal(bookingAttempt.res.status, 409);

    // Historical booking inserted directly (the API could never create it).
    const userId = (await pool.query("SELECT id FROM users WHERE email = 'user@test.local'"))
      .rows[0].id as string;
    const historical = (
      await pool.query(
        "INSERT INTO bookings (user_id, event_id, status) VALUES ($1, $2, 'confirmed') RETURNING id",
        [userId, past.id],
      )
    ).rows[0].id as string;
    const cancelAttempt = await api(
      ctx.baseUrl,
      `/api/bookings/${historical}/cancel`,
      { method: 'POST' },
      userCookie,
    );
    assert.equal(cancelAttempt.res.status, 409);
  });

  it('lets users cancel only their own bookings, once', async () => {
    const { id } = await createEvent(ctx.baseUrl, adminCookie, CONCERT);
    const booked = await api(
      ctx.baseUrl,
      '/api/bookings',
      { method: 'POST', body: JSON.stringify({ event_id: id }) },
      userCookie,
    );
    const bookingId = (booked.body?.booking as { id: string }).id;

    const foreign = await api(
      ctx.baseUrl,
      `/api/bookings/${bookingId}/cancel`,
      { method: 'POST' },
      otherCookie,
    );
    assert.equal(foreign.res.status, 403);

    const own = await api(
      ctx.baseUrl,
      `/api/bookings/${bookingId}/cancel`,
      { method: 'POST' },
      userCookie,
    );
    assert.equal(own.res.status, 200);
    const again = await api(
      ctx.baseUrl,
      `/api/bookings/${bookingId}/cancel`,
      { method: 'POST' },
      userCookie,
    );
    assert.equal(again.res.status, 409);
  });

  it('requires authentication and valid ids', async () => {
    const anonymous = await api(ctx.baseUrl, '/api/bookings', {
      method: 'POST',
      body: JSON.stringify({ event_id: '00000000-0000-4000-8000-000000000000' }),
    });
    assert.equal(anonymous.res.status, 401);
    const badId = await api(
      ctx.baseUrl,
      '/api/bookings',
      { method: 'POST', body: JSON.stringify({ event_id: 'nope' }) },
      userCookie,
    );
    assert.equal(badId.res.status, 400);
    const missing = await api(
      ctx.baseUrl,
      '/api/bookings',
      {
        method: 'POST',
        body: JSON.stringify({ event_id: '00000000-0000-4000-8000-000000000000' }),
      },
      userCookie,
    );
    assert.equal(missing.res.status, 404);
    const anonymousMine = await api(ctx.baseUrl, '/api/bookings/mine');
    assert.equal(anonymousMine.res.status, 401);
  });
});
