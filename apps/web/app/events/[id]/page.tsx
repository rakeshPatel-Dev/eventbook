'use client';

import { ArrowLeft, CalendarDays, CheckCircle2, Link2, MapPin, Ticket, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, friendlyErrorMessage, type ApiEvent, type ApiUser } from '../../../lib/api';
import { ErrorState } from '../../components/Feedback';
import { useMyBookings } from '../../components/MyBookings';
import Nav from '../../components/Nav';
import EventCard from '../../components/EventCard';
import {
  calendarParts,
  CapacityMeter,
  DateRail,
  eventState,
  formatDateLong,
  formatTime,
  isPastEvent,
  SeatsBadge,
} from '../../components/SeatsBadge';
import { useToast } from '../../components/Toast';

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const [event, setEvent] = useState<ApiEvent | null>(null);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  // Detail page checks the viewer's booking directly instead of relying on
  // the global provider cache, so the state is always fresh for this event.
  // null = still checking, false = no confirmed booking, true = holds one.
  const [heldBooking, setHeldBooking] = useState<boolean | null>(null);
  const [more, setMore] = useState<ApiEvent[]>([]);
  const { success, error: toastError, info: toastInfo, loading: loadingToast } = useToast();
  const { confirmedIds, refresh: refreshBookings } = useMyBookings();

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
        const msg = detail.status === 404 ? 'Event not found.' : 'Could not load the event.';
        setError(msg);
        toastError('Could not load event', msg);
      }
      const viewer = me.status === 200 && me.data ? me.data.user : null;
      setUser(viewer);
      if (viewer) {
        try {
          const mine = await api<{ bookings: import('../../../lib/api').ApiBooking[] }>(
            '/api/bookings/mine',
          );
          if (mine.status === 200 && mine.data) {
            setHeldBooking(
              mine.data.bookings.some(
                (b) => (b.eventId ?? b.event?.id) === params.id && b.status === 'confirmed',
              ),
            );
          } else {
            setHeldBooking(false);
          }
        } catch {
          setHeldBooking(false);
        }
      } else {
        setHeldBooking(false);
      }
    } catch {
      const msg = 'Could not reach the API. Check your connection and retry.';
      setError(msg);
      toastError('Network error', msg);
    } finally {
      setLoading(false);
    }
  }, [params.id, toastError]);

  useEffect(() => {
    void load();
  }, [load]);

  // "More to explore" rail: other upcoming events, current one excluded.
  // Secondary content — fails silently so it never blocks the detail.
  useEffect(() => {
    if (!event) {
      return;
    }
    const currentId = event.id;
    let cancelled = false;
    async function run() {
      try {
        const { status, data } = await api<{ events: ApiEvent[] }>('/api/events?page=1&limit=4');
        if (!cancelled && status === 200 && data) {
          setMore(data.events.filter((e) => e.id !== currentId).slice(0, 3));
        }
      } catch {
        /* ignore: rail simply stays hidden */
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [event]);

  async function book() {
    if (!event) {
      return;
    }
    setBooking(true);
    const t = loadingToast('Booking your seat…', 'Reserving your spot.');
    try {
      const { status, data } = await api('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({ event_id: event.id }),
      });
      if (status === 201) {
        t.success('Seat booked', 'See it under My bookings.');
        setHeldBooking(true);
        await refreshBookings();
        await load();
      } else if (status === 409 && /already hold/i.test(friendlyErrorMessage(status, data, ''))) {
        // Another tab (or a stale pre-check) booked first — adopt the truth.
        t.dismiss();
        setHeldBooking(true);
        await refreshBookings();
        toastInfo('Already booked', 'You already hold a seat for this event.');
      } else {
        const msg = friendlyErrorMessage(status, data, 'Booking failed.');
        t.error('Booking failed', msg);
      }
    } catch {
      t.error('Network error', 'Could not reach the API. Is the backend running?');
    } finally {
      setBooking(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      success('Link copied', 'Share this event with a friend.');
    } catch {
      toastError('Copy failed', 'Your browser blocked clipboard access.');
    }
  }

  const past = event ? isPastEvent(event.startsAt) : false;
  const state = event ? eventState(event) : 'available';
  const full = state === 'soldout';
  const low = state === 'tight' || state === 'critical';
  // Direct check wins once loaded; the provider covers the brief checking window.
  const held = event
    ? heldBooking === true || (heldBooking === null && confirmedIds.has(event.id))
    : false;
  const alreadyBooked = !past && held;
  const cal = event ? calendarParts(event.startsAt) : null;
  const taken = event ? Math.max(0, event.totalSeats - event.seatsLeft) : 0;
  const articleBorder =
    state === 'soldout'
      ? 'border-red-900/40'
      : state === 'critical'
        ? 'border-red-600/50'
        : state === 'tight'
          ? 'border-amber-600/40'
          : alreadyBooked
            ? 'border-ok-ink/40'
            : 'border-line';

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex min-h-[44px] items-center justify-between gap-3">
          <Link
            href="/events"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 py-2 text-sm text-muted hover:text-ink"
          >
            <ArrowLeft size={15} /> All events
          </Link>
          {event && (
            <button
              onClick={copyLink}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-line bg-card px-4 py-1.5 text-sm text-muted transition-colors hover:text-ink"
            >
              <Link2 size={14} /> Share
            </button>
          )}
        </div>
        {loading ? (
          <div
            className="mt-4 overflow-hidden rounded-4xl border border-line bg-card"
            aria-label="Loading event"
          >
            <div className="flex items-start gap-4 p-6 sm:p-7">
              <div className="w-[68px] shrink-0">
                <div className="skeleton h-2.5 w-8 rounded" />
                <div className="skeleton mt-2 h-14 w-14 rounded-md" />
                <div className="skeleton mt-2 h-2.5 w-10 rounded" />
              </div>
              <div aria-hidden="true" className="w-px self-stretch bg-line" />
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-1">
                <div className="skeleton h-[26px] w-28 rounded-full" />
                <div className="skeleton h-[26px] w-24 rounded-full" />
              </div>
            </div>
            <div className="space-y-3 p-6 sm:p-8">
              <div className="skeleton h-8 w-2/3 rounded" />
              <div className="skeleton h-4 w-1/2 rounded" />
              <div className="skeleton h-1.5 w-full rounded-full" />
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-[48px] w-44 rounded-full" />
            </div>
          </div>
        ) : error || !event ? (
          <ErrorState
            title="Could not load event"
            message={error ?? 'Event not found.'}
            onRetry={() => load()}
            retryLabel="Reload event"
          />
        ) : (
          <>
            <article
              className={`page-rise mt-4 overflow-hidden rounded-4xl border bg-card md:grid md:grid-cols-[300px_1fr] ${articleBorder}`}
            >
              {/* Ticket stub — same 68px rail + rule geometry as cards, larger numeral */}
              <div className="flex items-start gap-4 p-6 sm:p-7 md:h-full md:flex-col md:justify-center md:gap-6">
                <div className="flex items-start gap-4">
                  <DateRail startsAt={event.startsAt} size="lg" dimmed={past} />
                  <div aria-hidden="true" className="w-px self-stretch bg-line md:hidden" />
                  <div className="flex min-w-0 flex-col justify-center gap-2 py-1">
                    <SeatsBadge event={event} />
                    {held && (
                      <span className="inline-flex h-[26px] w-fit items-center gap-1 rounded-full bg-ok-bg px-2.5 text-xs font-semibold text-ok-ink">
                        <CheckCircle2 size={12} /> {past ? 'You attended' : 'Booked'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="hidden w-full md:block">
                  <div aria-hidden="true" className="ticket-edge" />
                  <CapacityMeter event={event} className="mt-4" />
                  <dl className="mt-3 space-y-2 text-sm tabular-nums">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted">Taken</dt>
                      <dd className="font-semibold">
                        {taken}/{event.totalSeats}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted">Left</dt>
                      <dd
                        className={`font-semibold tabular-nums ${
                          past
                            ? 'text-muted'
                            : state === 'critical'
                              ? 'text-red-600'
                              : state === 'tight'
                                ? 'text-amber-700'
                                : state === 'moderate'
                                  ? 'text-yellow-700'
                                  : 'text-ink'
                        }`}
                      >
                        {past ? '—' : event.seatsLeft}
                      </dd>
                    </div>
                    {cal?.relative && !past && (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-muted">When</dt>
                        <dd className="font-semibold">{cal.relative}</dd>
                      </div>
                    )}
                  </dl>
                </div>
                <p className="ml-auto inline-flex items-center gap-1.5 self-center text-sm tabular-nums text-muted md:hidden">
                  <Users size={15} /> {taken}/{event.totalSeats}
                </p>
              </div>
              {/* Main body — icon column fixed at w-5 so rows share a left edge */}
              <div className="border-t border-dashed border-line p-6 sm:p-8 md:border-l md:border-t-0">
                <h1 className="font-display text-3xl font-bold leading-[1.08] tracking-tight sm:text-4xl">
                  {event.title}
                </h1>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center gap-3">
                    <dt className="flex w-5 shrink-0 justify-center text-faint" aria-hidden="true">
                      <CalendarDays size={15} />
                    </dt>
                    <dd className="text-muted">
                      <time dateTime={cal?.iso}>{event && formatDateLong(event.startsAt)}</time>
                      <span aria-hidden="true"> · </span>
                      <span className="font-semibold tabular-nums text-ink">
                        {event && formatTime(event.startsAt)}
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-center gap-3">
                    <dt className="flex w-5 shrink-0 justify-center text-faint" aria-hidden="true">
                      <MapPin size={15} />
                    </dt>
                    <dd className="text-muted">{event.venue}</dd>
                  </div>
                  <div className="flex items-center gap-3">
                    <dt className="flex w-5 shrink-0 justify-center text-faint" aria-hidden="true">
                      <Users size={15} />
                    </dt>
                    <dd className="tabular-nums text-muted">
                      {taken} of {event.totalSeats} seats taken
                    </dd>
                  </div>
                </dl>
                <CapacityMeter event={event} className="mt-4 md:hidden" />
                {event.description && (
                  <p className="mt-4 max-w-2xl leading-relaxed text-ink/90">{event.description}</p>
                )}
                <div className="ticket-edge my-6" aria-hidden="true" />
                <div>
                  {!user ? (
                    <p className="rounded-2xl border border-line bg-paper px-4 py-3.5 text-sm text-muted">
                      <Link
                        href="/login"
                        className="font-semibold text-primary-deep hover:underline"
                      >
                        Sign in
                      </Link>{' '}
                      to book a seat.
                    </p>
                  ) : past ? (
                    <div className="rounded-2xl border border-line bg-line/50 px-4 py-3.5">
                      <p className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                        <CheckCircle2 size={16} /> This event has ended.
                      </p>
                      <p className="mt-1 text-sm text-muted">Booking is closed for past events.</p>
                      {held && (
                        <p className="mt-1 inline-flex items-center gap-1.5 font-medium text-ok-ink">
                          <CheckCircle2 size={14} /> You held a seat for this event.
                        </p>
                      )}
                    </div>
                  ) : user && heldBooking === null ? (
                    <p
                      className="rounded-2xl border border-line bg-paper px-4 py-3.5 text-sm text-muted"
                      aria-live="polite"
                    >
                      Checking your booking…
                    </p>
                  ) : alreadyBooked ? (
                    <div className="rounded-2xl border border-line bg-ok-bg/40 px-4 py-3.5">
                      <p className="inline-flex items-center gap-2 text-sm font-semibold text-ok-ink">
                        <CheckCircle2 size={16} /> You already booked this event.
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        <Link
                          href="/bookings"
                          className="font-medium text-primary-deep hover:underline"
                        >
                          View it under My bookings
                        </Link>{' '}
                        or cancel there to free the seat.
                      </p>
                    </div>
                  ) : event.seatsLeft <= 0 ? (
                    <div className="rounded-2xl border border-red-900/30 bg-red-50 px-4 py-3.5">
                      <p className="inline-flex items-center gap-2 text-sm font-semibold text-red-900">
                        <Ticket size={16} /> Sold out — {taken}/{event.totalSeats} taken.
                      </p>
                      <p className="mt-1 text-sm text-red-800/80">
                        Check back if someone cancels a seat.
                      </p>
                    </div>
                  ) : low ? (
                    <div>
                      <p
                        className={`rounded-2xl border px-4 py-3.5 text-sm text-muted ${
                          state === 'critical'
                            ? 'border-red-200 bg-red-50'
                            : 'border-amber-200 bg-amber-50'
                        }`}
                      >
                        <span
                          className={`font-semibold ${
                            state === 'critical' ? 'text-red-700' : 'text-amber-800'
                          }`}
                        >
                          {state === 'critical' && event.seatsLeft === 1
                            ? 'Last seat.'
                            : `Almost gone — only ${event.seatsLeft} left.`}
                        </span>{' '}
                        Book now to secure your seat.
                      </p>
                      <button
                        onClick={book}
                        disabled={booking}
                        className="mt-3 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-primary-hover disabled:opacity-50"
                      >
                        <Ticket size={16} />{' '}
                        {booking ? 'Booking…' : `Book a seat · ${event.seatsLeft} left`}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={book}
                      disabled={booking}
                      className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-primary-hover disabled:opacity-50"
                    >
                      <Ticket size={16} />{' '}
                      {booking ? 'Booking…' : `Book a seat · ${event.seatsLeft} left`}
                    </button>
                  )}
                </div>
              </div>
            </article>
            {more.length > 0 && (
              <section aria-label="More to explore" className="mt-12">
                <div className="flex items-baseline justify-between gap-3 border-b border-ink/15 pb-4">
                  <h2 className="font-display text-2xl font-bold tracking-tight">
                    More you can explore
                  </h2>
                  <Link
                    href="/events"
                    className="shrink-0 text-sm font-semibold text-primary-deep hover:underline"
                  >
                    Browse all
                  </Link>
                </div>
                <div className="grid grid-cols-1 gap-5 pt-6 md:grid-cols-2 lg:grid-cols-3">
                  {more.map((e) => (
                    <EventCard key={e.id} event={e} booked={confirmedIds.has(e.id)} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
