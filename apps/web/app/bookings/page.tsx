'use client';

import { ArrowUpRight, CalendarX2, TicketX } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, friendlyErrorMessage, type ApiBooking } from '../../lib/api';
import { EmptyState, ErrorState } from '../components/Feedback';
import Nav from '../components/Nav';
import { calendarParts, DateRail, formatTime, isPastEvent } from '../components/SeatsBadge';
import { useToast } from '../components/Toast';

export default function BookingsPage() {
  const [bookings, setBookings] = useState<ApiBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const { error: toastError, loading: loadingToast } = useToast();

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
        const msg = 'Could not load bookings.';
        setError(msg);
        toastError('Bookings failed to load', msg);
      }
    } catch {
      const msg = 'Could not reach the API. Check your connection and retry.';
      setError(msg);
      toastError('Network error', msg);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sessions can die while this page is open (logout in another tab,
  // expired cookie). Re-check quietly on focus: 401 flips to the
  // sign-in screen instead of showing stale bookings. Other failures
  // stay silent here — the explicit reload path reports them.
  useEffect(() => {
    async function revalidate() {
      try {
        const { status, data } = await api<{ bookings: ApiBooking[] }>('/api/bookings/mine');
        if (status === 200 && data) {
          setBookings(data.bookings);
          setNeedsLogin(false);
        } else if (status === 401) {
          setBookings([]);
          setNeedsLogin(true);
        }
      } catch {
        /* ignore: explicit reload surfaces errors */
      }
    }
    window.addEventListener('focus', revalidate);
    return () => window.removeEventListener('focus', revalidate);
  }, []);

  async function cancel(id: string) {
    setCancelling(id);
    const t = loadingToast('Cancelling booking…', 'Releasing your seat.');
    try {
      const { status, data } = await api(`/api/bookings/${id}/cancel`, { method: 'POST' });
      if (status === 200) {
        t.success('Booking cancelled', 'The seat is free again.');
        setConfirmId(null);
        await load();
      } else {
        t.error('Cancellation failed', friendlyErrorMessage(status, data, 'Cancellation failed.'));
      }
    } catch {
      t.error('Network error', 'Could not reach the API. Is the backend running?');
    } finally {
      setCancelling(null);
    }
  }

  const upcoming = bookings.filter(
    (b) => b.status === 'confirmed' && b.event && !isPastEvent(b.event.startsAt),
  );
  const others = bookings.filter(
    (b) => !(b.status === 'confirmed' && b.event && !isPastEvent(b.event.startsAt)),
  );

  function row(booking: ApiBooking, active: boolean) {
    const past = booking.event ? isPastEvent(booking.event.startsAt) : false;
    const confirming = confirmId === booking.id;
    const cal = booking.event ? calendarParts(booking.event.startsAt) : null;
    return (
      <li key={booking.id} className="overflow-hidden rounded-4xl border border-line bg-card">
        <div className="flex items-start gap-4 p-5 sm:p-6">
          {booking.event ? (
            <DateRail startsAt={booking.event.startsAt} size="sm" />
          ) : (
            <div className="w-[68px] shrink-0 text-xs text-faint">No date</div>
          )}
          <div
            aria-hidden="true"
            className="w-px self-stretch bg-[repeating-linear-gradient(to_bottom,var(--color-line)_0_5px,transparent_5px_10px)]"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {booking.event ? (
              <Link
                href={`/events/${booking.event.id}`}
                className="truncate font-display text-[17px] font-bold leading-snug tracking-tight hover:text-primary-deep"
              >
                {booking.event.title}
              </Link>
            ) : (
              <span className="font-semibold">Unknown event</span>
            )}
            {booking.event && cal && (
              <p className="truncate text-[13px] tabular-nums text-muted">
                <time dateTime={cal.iso}>
                  {cal.weekday}, {formatTime(booking.event.startsAt)}
                </time>
                <span aria-hidden="true"> · </span>
                {booking.event.venue}
              </p>
            )}
            <p className="pt-0.5 text-xs">
              <span
                className={`inline-flex h-[24px] items-center rounded-full px-2.5 font-semibold ${
                  active
                    ? 'bg-ok-bg text-ok-ink'
                    : booking.status === 'cancelled'
                      ? 'border border-red-200 bg-red-50 text-red-800'
                      : 'border border-line bg-line/70 text-muted'
                }`}
              >
                {active ? 'Confirmed' : booking.status === 'cancelled' ? 'Cancelled' : 'Ended'}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end justify-center gap-2 self-center">
            {booking.event && (
              <Link
                href={`/events/${booking.event.id}`}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-paper"
              >
                View <ArrowUpRight size={14} />
              </Link>
            )}
            {active &&
              (confirming ? (
                <span className="flex items-center gap-2 text-sm">
                  <button
                    onClick={() => setConfirmId(null)}
                    className="rounded-full px-4 py-2 text-muted hover:bg-paper"
                  >
                    Keep
                  </button>
                  <button
                    onClick={() => cancel(booking.id)}
                    disabled={cancelling === booking.id}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary px-4 py-2 font-medium text-ink transition-colors hover:bg-danger hover:text-white disabled:opacity-50"
                  >
                    <TicketX size={15} />
                    {cancelling === booking.id ? 'Cancelling…' : 'Confirm cancel'}
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmId(booking.id)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-paper"
                >
                  <TicketX size={15} />
                  Cancel
                </button>
              ))}
          </div>
        </div>
        {confirming && (
          <p className="border-t border-dashed border-line bg-paper px-5 py-2.5 text-xs text-muted">
            Cancelling frees the seat immediately. This cannot be undone.
          </p>
        )}
      </li>
    );
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-sm font-medium text-muted">Your seats</p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          My bookings
        </h1>
        <p className="mt-2 text-sm text-muted">
          {upcoming.length > 0
            ? `${upcoming.length} upcoming ${upcoming.length === 1 ? 'seat' : 'seats'}. Cancelling frees the seat.`
            : 'Seats you hold. Cancelling frees the seat.'}
        </p>
        {loading ? (
          <ul className="mt-6 grid gap-4 md:grid-cols-2" aria-label="Loading bookings">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="rounded-4xl border border-line bg-card p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="w-[68px] shrink-0">
                    <div className="skeleton h-2.5 w-8 rounded" />
                    <div className="skeleton mt-2 h-8 w-10 rounded-md" />
                    <div className="skeleton mt-2 h-2.5 w-10 rounded" />
                  </div>
                  <div aria-hidden="true" className="w-px self-stretch bg-line" />
                  <div className="min-w-0 flex-1 space-y-2 py-0.5">
                    <div className="skeleton h-4 w-3/4 rounded" />
                    <div className="skeleton h-3 w-2/3 rounded" />
                    <div className="skeleton h-6 w-24 rounded-full" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : needsLogin ? (
          <div className="mt-6 rounded-4xl border border-line bg-card p-8 text-center">
            <p className="text-sm text-muted">Sign in to see your bookings.</p>
            <Link
              href="/login"
              className="mt-4 inline-block min-h-[44px] rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-ink hover:bg-primary-hover"
            >
              Sign in
            </Link>
          </div>
        ) : error ? (
          <ErrorState title="Could not load bookings" message={error} onRetry={() => load()} />
        ) : bookings.length === 0 ? (
          <EmptyState
            icon={<CalendarX2 size={24} />}
            title="No bookings yet"
            message="Find an experience and reserve your seat."
            action={
              <Link
                href="/events"
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-ink hover:bg-primary-hover"
              >
                Browse events
              </Link>
            }
          />
        ) : (
          <div className="mt-6 space-y-8">
            {upcoming.length > 0 && (
              <section aria-label="Upcoming bookings">
                <h2 className="border-b border-ink/15 pb-3 font-display text-xl font-bold tracking-tight">
                  Upcoming
                </h2>
                <ul className="mt-4 grid gap-4 md:grid-cols-2">
                  {upcoming.map((b) => row(b, true))}
                </ul>
              </section>
            )}
            {others.length > 0 && (
              <section aria-label="Past and cancelled bookings">
                <h2 className="border-b border-ink/15 pb-3 font-display text-xl font-bold tracking-tight">
                  Past and cancelled
                </h2>
                <ul className="mt-4 grid gap-4 md:grid-cols-2">
                  {others.map((b) =>
                    row(b, b.status === 'confirmed' && !(b.event && isPastEvent(b.event.startsAt))),
                  )}
                </ul>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
