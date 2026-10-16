'use client';

import { CalendarX2, TicketX } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, apiErrorMessage, type ApiBooking } from '../../lib/api';
import Nav from '../components/Nav';
import { formatDateTime, isPastEvent } from '../components/SeatsBadge';

export default function BookingsPage() {
  const [bookings, setBookings] = useState<ApiBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status, data } = await api<{ bookings: ApiBooking[] }>('/api/bookings/mine');
      if (status === 200 && data) {
        setBookings(data.bookings);
        setNeedsLogin(false);
      } else if (status === 401) {
        setNeedsLogin(true);
      } else {
        setError('Could not load bookings.');
      }
    } catch {
      setError('Could not reach the API. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(id: string) {
    setCancelling(id);
    setMessage(null);
    try {
      const { status, data } = await api(`/api/bookings/${id}/cancel`, { method: 'POST' });
      if (status === 200) {
        setMessage('Booking cancelled; the seat is free again.');
        await load();
      } else {
        setMessage(apiErrorMessage(data, 'Cancellation failed.'));
      }
    } catch {
      setMessage('Could not reach the API. Is the backend running?');
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">My bookings</h1>
        <p className="mt-1 text-sm text-muted">Seats you hold. Cancelling frees the seat.</p>
        {loading ? (
          <p className="mt-6 text-sm text-muted">Loading bookings…</p>
        ) : needsLogin ? (
          <div className="mt-6 rounded-xl bg-card p-8 text-center shadow-sm">
            <p className="text-sm text-muted">Sign in to see your bookings.</p>
            <Link
              href="/login"
              className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Sign in
            </Link>
          </div>
        ) : error ? (
          <p className="mt-6 text-sm text-danger">{error}</p>
        ) : bookings.length === 0 ? (
          <div className="mt-6 flex flex-col items-center rounded-xl bg-card px-6 py-12 text-center shadow-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper text-faint">
              <CalendarX2 size={24} />
            </span>
            <h3 className="mt-3 font-semibold">No bookings yet</h3>
            <p className="mt-1 text-sm text-muted">Find an experience and reserve your seat.</p>
            <Link
              href="/events"
              className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white"
            >
              Browse events
            </Link>
          </div>
        ) : (
          <>
            {message && <p className="mt-4 text-sm text-muted">{message}</p>}
            <ul className="mt-4 space-y-4">
              {bookings.map((booking) => {
                const past = booking.event ? isPastEvent(booking.event.startsAt) : false;
                const active = booking.status === 'confirmed' && !past;
                return (
                  <li key={booking.id} className="rounded-xl bg-card p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {booking.event ? (
                          <Link
                            href={`/events/${booking.event.id}`}
                            className="font-semibold hover:text-primary"
                          >
                            {booking.event.title}
                          </Link>
                        ) : (
                          <span className="font-semibold">Unknown event</span>
                        )}
                        {booking.event && (
                          <p className="mt-1 text-sm text-muted">
                            {formatDateTime(booking.event.startsAt)} · {booking.event.venue}
                          </p>
                        )}
                        <p className="mt-1.5 text-xs">
                          <span
                            className={`rounded-full px-2 py-0.5 font-medium ${
                              active ? 'bg-ok-bg text-ok-ink' : 'bg-zinc-200 text-zinc-600'
                            }`}
                          >
                            {booking.status}
                            {past ? ' · past event' : ''}
                          </span>
                        </p>
                      </div>
                      {active && (
                        <button
                          onClick={() => cancel(booking.id)}
                          disabled={cancelling === booking.id}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition-colors hover:bg-paper disabled:opacity-50"
                        >
                          <TicketX size={15} />
                          {cancelling === booking.id ? 'Cancelling…' : 'Cancel'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
