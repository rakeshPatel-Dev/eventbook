'use client';

import { ArrowLeft, CalendarDays, MapPin, Ticket } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, apiErrorMessage, type ApiEvent, type ApiUser } from '../../../lib/api';
import Nav from '../../components/Nav';
import {
  calendarParts,
  formatDateTime,
  isPastEvent,
  SeatsBadge,
} from '../../components/SeatsBadge';

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
        setMessage('Seat booked. See it under My bookings.');
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

  const past = event ? isPastEvent(event.startsAt) : false;
  const cal = event ? calendarParts(event.startsAt) : null;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Link
          href="/events"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft size={15} /> All events
        </Link>
        {loading ? (
          <p className="mt-6 text-sm text-muted">Loading event…</p>
        ) : error || !event ? (
          <p className="mt-6 text-sm text-danger">{error ?? 'Event not found.'}</p>
        ) : (
          <article className="mt-4 overflow-hidden rounded-xl bg-card shadow-sm">
            <div className="flex items-center justify-between bg-gradient-to-br from-primary-soft via-paper to-line px-5 py-4">
              <div className="flex min-w-[3.5rem] flex-col items-center overflow-hidden rounded-lg bg-card shadow">
                <span className="w-full bg-ink px-2 py-0.5 text-center text-xs font-bold tracking-widest text-card">
                  {cal?.month}
                </span>
                <span className="px-2 py-1 text-2xl font-bold leading-none">{cal?.day}</span>
              </div>
              <SeatsBadge event={event} />
            </div>
            <div className="p-6">
              <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
              <p className="mt-3 flex flex-col gap-1.5 text-sm text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={15} /> {formatDateTime(event.startsAt)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={15} /> {event.venue}
                </span>
              </p>
              {event.description && <p className="mt-4 leading-relaxed">{event.description}</p>}
              <div className="mt-6 border-t border-line pt-5">
                {!user ? (
                  <p className="text-sm text-muted">
                    <Link href="/login" className="font-medium text-primary hover:underline">
                      Sign in
                    </Link>{' '}
                    to book a seat.
                  </p>
                ) : (
                  <button
                    onClick={book}
                    disabled={booking || past || event.seatsLeft <= 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    <Ticket size={16} /> {booking ? 'Booking…' : 'Book a seat'}
                  </button>
                )}
                {message && <p className="mt-2 text-sm text-muted">{message}</p>}
              </div>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
