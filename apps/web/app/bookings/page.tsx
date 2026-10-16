'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, apiErrorMessage, type ApiBooking } from '../../lib/api';
import Nav from '../components/Nav';

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
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-zinc-900">My bookings</h1>
        {loading ? (
          <p className="mt-6 text-sm text-zinc-600">Loading bookings…</p>
        ) : needsLogin ? (
          <p className="mt-6 text-sm text-zinc-600">
            <Link href="/login" className="underline">
              Log in
            </Link>{' '}
            to see your bookings.
          </p>
        ) : error ? (
          <p className="mt-6 text-sm text-red-600">{error}</p>
        ) : bookings.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-600">
            No bookings yet.{' '}
            <Link href="/events" className="underline">
              Browse events
            </Link>
            .
          </p>
        ) : (
          <>
            {message && <p className="mt-4 text-sm text-zinc-700">{message}</p>}
            <ul className="mt-4 space-y-4">
              {bookings.map((booking) => {
                const past = booking.event
                  ? new Date(booking.event.startsAt).getTime() <= Date.now()
                  : false;
                return (
                  <li key={booking.id} className="rounded border border-zinc-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {booking.event ? (
                          <Link
                            href={`/events/${booking.event.id}`}
                            className="font-medium text-zinc-900 underline"
                          >
                            {booking.event.title}
                          </Link>
                        ) : (
                          <span className="font-medium text-zinc-900">Unknown event</span>
                        )}
                        {booking.event && (
                          <p className="mt-1 text-sm text-zinc-600">
                            {new Date(booking.event.startsAt).toLocaleString()} ·{' '}
                            {booking.event.venue}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-zinc-500">
                          Status: {booking.status}
                          {past ? ' · past event' : ''}
                        </p>
                      </div>
                      {booking.status === 'confirmed' && !past && (
                        <button
                          onClick={() => cancel(booking.id)}
                          disabled={cancelling === booking.id}
                          className="shrink-0 rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-50"
                        >
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
