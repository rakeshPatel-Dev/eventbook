'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, apiErrorMessage, type ApiEvent, type ApiUser } from '../../../lib/api';
import Nav from '../../components/Nav';

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const [event, setEvent] = useState<ApiEvent | null>(null);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, me] = await Promise.all([
        api<{ event: ApiEvent }>(`/api/events/${params.id}`),
        api<{ user: ApiUser }>('/api/auth/me'),
      ]);
      if (detail.status === 200 && detail.data) {
        setEvent(detail.data.event);
      } else {
        setError(detail.status === 404 ? 'Event not found.' : 'Could not load the event.');
      }
      setUser(me.status === 200 && me.data ? me.data.user : null);
    } catch {
      setError('Could not reach the API. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function book() {
    if (!event) {
      return;
    }
    setBooking(true);
    setMessage(null);
    try {
      const { status, data } = await api('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({ event_id: event.id }),
      });
      if (status === 201) {
        setMessage('Seat booked.');
        await load();
      } else {
        setMessage(apiErrorMessage(data, 'Booking failed.'));
      }
    } catch {
      setMessage('Could not reach the API. Is the backend running?');
    } finally {
      setBooking(false);
    }
  }

  const isPast = event ? new Date(event.startsAt).getTime() <= Date.now() : false;

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/events" className="text-sm text-zinc-600 underline">
          ← All events
        </Link>
        {loading ? (
          <p className="mt-6 text-sm text-zinc-600">Loading event…</p>
        ) : error || !event ? (
          <p className="mt-6 text-sm text-red-600">{error ?? 'Event not found.'}</p>
        ) : (
          <div className="mt-4 rounded border border-zinc-200 bg-white p-6">
            <h1 className="text-2xl font-semibold text-zinc-900">{event.title}</h1>
            <p className="mt-2 text-sm text-zinc-600">
              {new Date(event.startsAt).toLocaleString()} · {event.venue}
            </p>
            {event.description && <p className="mt-4 text-zinc-800">{event.description}</p>}
            <p className="mt-4 text-sm font-medium text-zinc-700">
              {isPast
                ? 'This event already happened.'
                : event.seatsLeft > 0
                  ? `${event.seatsLeft} of ${event.totalSeats} seats left`
                  : 'This event is full.'}
            </p>
            <div className="mt-4">
              {!user ? (
                <p className="text-sm text-zinc-600">
                  <Link href="/login" className="underline">
                    Log in
                  </Link>{' '}
                  to book a seat.
                </p>
              ) : (
                <button
                  onClick={book}
                  disabled={booking || isPast || event.seatsLeft <= 0}
                  className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {booking ? 'Booking…' : 'Book a seat'}
                </button>
              )}
              {message && <p className="mt-2 text-sm text-zinc-700">{message}</p>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
