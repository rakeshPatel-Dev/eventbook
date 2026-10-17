'use client';

import { Archive, CalendarDays, Flame, Pencil, Search, Ticket, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { useForm } from 'react-hook-form';
import {
  api,
  friendlyErrorMessage,
  type ApiEvent,
  type ApiUser,
  type Pagination,
} from '../../lib/api';
import Nav from '../components/Nav';
import { ErrorState } from '../components/Feedback';
import {
  calendarParts,
  CapacityMeter,
  DateRail,
  eventState,
  formatTime,
  SeatsBadge,
} from '../components/SeatsBadge';
import { useToast } from '../components/Toast';

interface Attendee {
  id: string;
  userId: string;
  email: string;
  createdAt: string;
}

interface EventForm {
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  totalSeats: number;
}

const EMPTY_FORM: EventForm = {
  title: '',
  description: '',
  venue: '',
  startsAt: '',
  totalSeats: 10,
};

const inputClass =
  'mt-1.5 w-full rounded-xl border border-line bg-card px-3.5 py-2.5 outline-none placeholder:text-faint focus:border-ink/50';

function toInputValue(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function toPayload(values: EventForm) {
  return {
    title: values.title,
    description: values.description,
    venue: values.venue,
    starts_at: values.startsAt ? new Date(values.startsAt).toISOString() : values.startsAt,
    total_seats: Number(values.totalSeats),
  };
}

// Initials from an email local part: "jane.doe@x" → "JD", "admin@x" → "A".
function initials(email: string): string {
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  return letters || (local[0] ?? '?').toUpperCase();
}

const AVATAR_TINTS = [
  'bg-primary-soft text-primary-deep',
  'bg-ok-bg text-ok-ink',
  'bg-amber-100 text-amber-800',
  'bg-yellow-100 text-yellow-800',
];

// Deterministic soft tint per email so repeat attendees keep their color.
function avatarTint(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i += 1) {
    hash = (hash + email.charCodeAt(i)) % 997;
  }
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

const titleRules = { required: 'Title is required.' };
const venueRules = { required: 'Venue is required.' };
const startsAtRules = { required: 'Start date and time are required.' };
const seatsRules = {
  required: 'Seats are required.',
  min: { value: 1, message: 'Seats must be at least 1.' },
  validate: (v: number) => Number.isInteger(Number(v)) || 'Seats must be a whole number.',
};

type StatusTab = 'all' | 'upcoming' | 'soldout' | 'past';

const TABS: { id: StatusTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'soldout', label: 'Sold out' },
  { id: 'past', label: 'Past' },
];

export default function AdminPage() {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<Record<string, Attendee[]>>({});
  const [openAttendees, setOpenAttendees] = useState<Record<string, boolean>>({});
  const [attendeeErrors, setAttendeeErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<StatusTab>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const { error: toastError, loading: loadingToast } = useToast();

  const createForm = useForm<EventForm>({ defaultValues: EMPTY_FORM });
  const editForm = useForm<EventForm>({ defaultValues: EMPTY_FORM });

  const loadEvents = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      setError(null);
      try {
        const { status, data } = await api<{ events: ApiEvent[]; pagination: Pagination }>(
          `/api/events?scope=all&limit=50&page=${pageNum}`,
        );
        if (status === 200 && data) {
          setEvents(data.events);
          setTotalPages(data.pagination.totalPages);
          setPage(data.pagination.page);
        } else {
          const msg =
            status === 401 || status === 403
              ? 'Admin access required to list all events.'
              : 'Could not load events.';
          setError(msg);
          toastError('Load failed', msg);
        }
      } catch {
        const msg = 'Could not reach the API. Check your connection and retry.';
        setError(msg);
        toastError('Network error', msg);
      } finally {
        setLoading(false);
      }
    },
    [toastError],
  );

  // Reset to first page when search or tab changes.
  useEffect(() => {
    setPage(1);
  }, [query, tab]);

  useEffect(() => {
    async function check() {
      try {
        const { status, data } = await api<{ user: ApiUser }>('/api/auth/me');
        const me = status === 200 && data ? data.user : null;
        setUser(me);
        if (me?.role === 'admin') {
          await loadEvents(1);
        }
      } finally {
        setChecking(false);
      }
    }
    void check();
  }, [loadEvents]);

  // Same staleness guard as bookings: if the session dies while this
  // page is open, drop to the restricted screen on next focus instead
  // of showing admin UI to a non-admin. Silent by design.
  useEffect(() => {
    async function revalidate() {
      try {
        const { status, data } = await api<{ user: ApiUser }>('/api/auth/me');
        setUser(status === 200 && data ? data.user : null);
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('focus', revalidate);
    return () => window.removeEventListener('focus', revalidate);
  }, []);

  async function create(values: EventForm) {
    setError(null);
    const t = loadingToast('Creating event…', 'Saving the new event to the database.');
    try {
      const { status, data } = await api('/api/events', {
        method: 'POST',
        body: JSON.stringify(toPayload(values)),
      });
      if (status === 201) {
        createForm.reset(EMPTY_FORM);
        t.success('Event created', 'It is now live for bookings.');
        await loadEvents(1);
      } else {
        const msg = friendlyErrorMessage(status, data, 'Could not create the event.');
        setError(msg);
        t.error('Create failed', msg);
      }
    } catch {
      const msg = 'Could not reach the API. Is the backend running?';
      setError(msg);
      t.error('Network error', msg);
    }
  }

  function startEdit(event: ApiEvent) {
    setEditingId(event.id);
    editForm.reset({
      title: event.title,
      description: event.description,
      venue: event.venue,
      startsAt: toInputValue(event.startsAt),
      totalSeats: event.totalSeats,
    });
    setError(null);
  }

  async function saveEdit(values: EventForm) {
    if (!editingId) {
      return;
    }
    setError(null);
    const t = loadingToast('Saving changes…', 'Updating the event details.');
    try {
      const { status, data } = await api(`/api/events/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(toPayload(values)),
      });
      if (status === 200) {
        setEditingId(null);
        t.success('Event updated', 'Your changes are saved.');
        await loadEvents(page);
      } else {
        const msg = friendlyErrorMessage(status, data, 'Could not update the event.');
        setError(msg);
        t.error('Update failed', msg);
      }
    } catch {
      const msg = 'Could not reach the API. Is the backend running?';
      setError(msg);
      t.error('Network error', msg);
    }
  }

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { id, title } = deleteTarget;
    setDeleteTarget(null);
    setError(null);
    const t = loadingToast('Deleting event…', `Removing “${title}”.`);
    try {
      const { status, data } = await api(`/api/events/${id}`, { method: 'DELETE' });
      if (status === 200) {
        t.success('Event deleted', 'The event has been removed.');
        await loadEvents(page);
      } else {
        const msg = friendlyErrorMessage(status, data, 'Could not delete the event.');
        setError(msg);
        t.error('Delete failed', msg);
      }
    } catch {
      const msg = 'Could not reach the API. Is the backend running?';
      setError(msg);
      t.error('Network error', msg);
    }
  }

  async function loadAttendees(id: string) {
    setAttendeeErrors((prev) => ({ ...prev, [id]: '' }));
    try {
      const { status, data } = await api<{ attendees: Attendee[] }>(`/api/events/${id}/attendees`);
      if (status === 200 && data) {
        setAttendees((prev) => ({ ...prev, [id]: data.attendees }));
      } else {
        setAttendeeErrors((prev) => ({
          ...prev,
          [id]: friendlyErrorMessage(status, data, 'Could not load attendees.'),
        }));
      }
    } catch {
      setAttendeeErrors((prev) => ({
        ...prev,
        [id]: 'Could not load attendees. Check your connection.',
      }));
    }
  }

  async function toggleAttendees(id: string) {
    const open = !openAttendees[id];
    setOpenAttendees((prev) => ({ ...prev, [id]: open }));
    if (open && !attendees[id]) {
      await loadAttendees(id);
    }
  }

  const metrics = useMemo(() => {
    const upcoming = events.filter((e) => eventState(e) !== 'past');
    const soldout = events.filter((e) => eventState(e) === 'soldout').length;
    const past = events.length - upcoming.length;
    const seats = upcoming.reduce((sum, e) => sum + e.totalSeats, 0);
    const taken = upcoming.reduce((sum, e) => sum + Math.max(0, e.totalSeats - e.seatsLeft), 0);
    const pct = seats > 0 ? Math.round((taken / seats) * 100) : 0;
    return { total: events.length, upcoming: upcoming.length, soldout, past, seats, taken, pct };
  }, [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      const state = eventState(e);
      if (tab === 'upcoming' && state === 'past') {
        return false;
      }
      if (tab === 'soldout' && state !== 'soldout') {
        return false;
      }
      if (tab === 'past' && state !== 'past') {
        return false;
      }
      if (q && !`${e.title} ${e.venue}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [events, query, tab]);

  const tabCounts = useMemo(
    () => ({
      all: events.length,
      upcoming: events.filter((e) => eventState(e) !== 'past').length,
      soldout: events.filter((e) => eventState(e) === 'soldout').length,
      past: events.filter((e) => eventState(e) === 'past').length,
    }),
    [events],
  );

  function formFields(
    form: typeof createForm,
    submitLabel: string,
    onCancel?: () => void,
    compact = false,
  ) {
    const {
      register,
      handleSubmit,
      formState: { errors, isSubmitting },
    } = form;
    const submit = form === createForm ? create : saveEdit;
    return (
      <form
        onSubmit={handleSubmit(submit)}
        className={`grid gap-4 ${compact ? '' : 'sm:grid-cols-2'}`}
        noValidate
      >
        <div className={compact ? '' : 'sm:col-span-2'}>
          <label className="text-sm font-medium" htmlFor={`${submitLabel}-title`}>
            Title
          </label>
          <input
            id={`${submitLabel}-title`}
            placeholder="Kathmandu JS Meetup #12"
            aria-label="Title"
            {...register('title', titleRules)}
            className={inputClass}
          />
          {errors.title && <p className="mt-1 text-sm text-danger">{errors.title.message}</p>}
        </div>
        <div className={compact ? '' : 'sm:col-span-2'}>
          <label className="text-sm font-medium" htmlFor={`${submitLabel}-desc`}>
            Description
          </label>
          <textarea
            id={`${submitLabel}-desc`}
            placeholder="What happens, who should come…"
            aria-label="Description"
            rows={3}
            {...register('description')}
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor={`${submitLabel}-venue`}>
            Venue
          </label>
          <input
            id={`${submitLabel}-venue`}
            placeholder="Community Hall, Kathmandu"
            aria-label="Venue"
            {...register('venue', venueRules)}
            className={inputClass}
          />
          {errors.venue && <p className="mt-1 text-sm text-danger">{errors.venue.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium" htmlFor={`${submitLabel}-starts`}>
              Starts
            </label>
            <input
              id={`${submitLabel}-starts`}
              type="datetime-local"
              aria-label="Starts at"
              {...register('startsAt', startsAtRules)}
              className={inputClass}
            />
            {errors.startsAt && (
              <p className="mt-1 text-sm text-danger">{errors.startsAt.message}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor={`${submitLabel}-seats`}>
              Seats
            </label>
            <input
              id={`${submitLabel}-seats`}
              type="number"
              min={1}
              aria-label="Total seats"
              {...register('totalSeats', seatsRules)}
              className={inputClass}
            />
            {errors.totalSeats && (
              <p className="mt-1 text-sm text-danger">{errors.totalSeats.message}</p>
            )}
          </div>
        </div>
        <div className={`flex gap-3 ${compact ? '' : 'sm:col-span-2'}`}>
          <button
            type="submit"
            disabled={isSubmitting}
            className="min-h-[44px] rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : submitLabel}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[44px] rounded-full border border-line px-5 py-2 text-sm font-medium hover:bg-paper"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    );
  }

  if (checking) {
    return (
      <div className="min-h-screen">
        <Nav />
        <p className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted sm:px-6">Checking session…</p>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <p className="text-sm font-medium text-muted">Restricted</p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">Admin</h1>
          <p className="mt-4 max-w-md rounded-4xl border border-line bg-card p-5 text-sm text-muted">
            This area is for admins only.{' '}
            <Link href="/login" className="font-semibold text-primary-deep hover:underline">
              Sign in
            </Link>{' '}
            with an admin account.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-sm font-medium text-muted">Backstage</p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Manage events
        </h1>
        <p className="mt-2 text-sm text-muted">
          Capacity monitoring, scheduling, and the attendee roster across all events.
        </p>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-line bg-danger-bg/50 px-4 py-2.5 text-sm text-danger"
          >
            {error}{' '}
            <button onClick={() => loadEvents(page)} className="ml-1 font-semibold underline">
              Retry
            </button>
          </p>
        )}

        <section
          aria-label="Operations summary"
          className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4"
        >
          <div className="rounded-4xl border border-line bg-card p-5">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted">
              <CalendarDays size={14} className="text-faint" /> TOTAL EVENTS
            </p>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums tracking-tight">
              {metrics.total}
            </p>
            <p className="mt-1 text-xs tabular-nums text-muted">{metrics.upcoming} upcoming</p>
          </div>
          <div className="rounded-4xl border border-line bg-card p-5">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted">
              <Ticket size={14} className="text-faint" /> SEATS BOOKED
            </p>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums tracking-tight">
              {metrics.taken}
              <span className="text-lg font-semibold text-faint">/{metrics.seats}</span>
            </p>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/80"
              role="progressbar"
              aria-valuenow={metrics.taken}
              aria-valuemin={0}
              aria-valuemax={metrics.seats}
              aria-label={`${metrics.taken} of ${metrics.seats} upcoming seats booked`}
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${metrics.pct}%` }}
              />
            </div>
            <p className="mt-1 text-xs tabular-nums text-muted">
              {metrics.pct}% of upcoming capacity
            </p>
          </div>
          <div className="rounded-4xl border border-line bg-card p-5">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted">
              <Flame size={14} className="text-faint" /> SOLD OUT
            </p>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums tracking-tight">
              {metrics.soldout}
            </p>
            <p className="mt-1 text-xs text-muted">
              {metrics.soldout > 0 ? 'High demand right now' : 'Nothing full right now'}
            </p>
          </div>
          <div className="rounded-4xl border border-line bg-card p-5">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted">
              <Archive size={14} className="text-faint" /> PAST
            </p>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums tracking-tight">
              {metrics.past}
            </p>
            <p className="mt-1 text-xs text-muted">Ended, kept for reference</p>
          </div>
        </section>

        <section className="mt-6 rounded-4xl border border-line bg-card p-5 sm:p-7">
          <h2 className="inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight">
            Create event
          </h2>
          <div className="mt-4">{formFields(createForm, 'Create event')}</div>
        </section>

        <section className="mt-10">
          <h2 className="border-b border-ink/15 pb-3 font-display text-2xl font-bold tracking-tight">
            All events
          </h2>
          <div className="mt-4 flex flex-col gap-3 rounded-4xl border border-line bg-card p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex w-full items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 focus-within:border-ink/40 lg:max-w-sm">
              <Search size={16} className="shrink-0 text-faint" />
              <input
                type="search"
                aria-label="Search events by title or venue"
                placeholder="Search by title or venue…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent py-1.5 text-sm outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
            <div
              className="flex items-center gap-1.5 overflow-x-auto"
              role="tablist"
              aria-label="Filter events by status"
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors ${
                    tab === t.id
                      ? 'bg-ink text-white'
                      : 'border border-line text-muted hover:bg-paper hover:text-ink'
                  }`}
                >
                  {t.label}
                  <span
                    className={`rounded-full px-1.5 text-xs tabular-nums ${
                      tab === t.id ? 'bg-white/20' : 'bg-paper text-faint'
                    }`}
                  >
                    {tabCounts[t.id]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <ul className="mt-4 space-y-4" aria-label="Loading events">
              {[0, 1].map((i) => (
                <li key={i} className="rounded-4xl border border-line bg-card p-5 sm:p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-[68px] shrink-0">
                      <div className="skeleton h-2.5 w-8 rounded" />
                      <div className="skeleton mt-2 h-8 w-10 rounded-md" />
                      <div className="skeleton mt-2 h-2.5 w-10 rounded" />
                    </div>
                    <div aria-hidden="true" className="w-px self-stretch bg-line" />
                    <div className="min-w-0 flex-1 space-y-2 py-0.5">
                      <div className="skeleton h-4 w-1/2 rounded" />
                      <div className="skeleton h-3 w-2/3 rounded" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : events.length === 0 && !error ? (
            <p className="mt-4 rounded-4xl border border-dashed border-line p-6 text-sm text-muted">
              No events yet. Create one above.
            </p>
          ) : events.length === 0 ? (
            <ErrorState
              title="Could not load events"
              message={error ?? 'No events.'}
              onRetry={() => loadEvents(page)}
            />
          ) : filtered.length === 0 ? (
            <div className="mt-4 rounded-4xl border border-dashed border-line bg-card/60 px-6 py-10 text-center">
              <p className="font-display font-bold tracking-tight">No matches</p>
              <p className="mt-1 text-sm text-muted">
                Nothing fits this search and filter. Try broadening either.
              </p>
              <button
                onClick={() => {
                  setQuery('');
                  setTab('all');
                }}
                className="mt-4 inline-flex min-h-[44px] items-center rounded-full border border-line px-5 text-sm font-medium hover:bg-paper"
              >
                Clear search and filter
              </button>
            </div>
          ) : (
            <>
              {error && (
                <ErrorState
                  title="Could not refresh events"
                  message={error}
                  onRetry={() => loadEvents(page)}
                />
              )}
              <div className="mt-4 overflow-x-auto rounded-4xl border border-line bg-card">
                <table className="w-full min-w-[880px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line text-xs font-semibold tracking-wide text-muted">
                      <th scope="col" className="px-5 py-3.5">
                        EVENT
                      </th>
                      <th scope="col" className="whitespace-nowrap px-5 py-3.5">
                        DATE & TIME
                      </th>
                      <th scope="col" className="px-5 py-3.5">
                        CAPACITY
                      </th>
                      <th scope="col" className="px-5 py-3.5">
                        STATUS
                      </th>
                      <th scope="col" className="px-5 py-3.5 text-right">
                        ACTIONS
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashed divide-line">
                    {filtered.map((event) =>
                      editingId === event.id ? (
                        <tr key={event.id}>
                          <td colSpan={5} className="px-5 py-5 sm:px-6">
                            {formFields(editForm, 'Save changes', () => setEditingId(null), true)}
                          </td>
                        </tr>
                      ) : (
                        <Fragment key={event.id}>
                          <tr key={event.id} className="group transition-colors hover:bg-paper/60">
                            <td className="px-5 py-4">
                              <div className="flex min-w-[240px] items-center gap-3">
                                <DateRail startsAt={event.startsAt} size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate font-display text-[15px] font-bold leading-snug tracking-tight group-hover:text-primary-deep">
                                    {event.title}
                                  </p>
                                  <p className="mt-0.5 truncate text-[13px] text-muted">
                                    {event.venue}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 text-sm tabular-nums text-muted">
                              {calendarParts(event.startsAt).weekday},{' '}
                              {calendarParts(event.startsAt).month}{' '}
                              {calendarParts(event.startsAt).day} · {formatTime(event.startsAt)}
                            </td>
                            <td className="px-5 py-4">
                              <div className="w-36">
                                <p className="text-xs tabular-nums text-muted">
                                  {Math.max(0, event.totalSeats - event.seatsLeft)}/
                                  {event.totalSeats} taken
                                </p>
                                <CapacityMeter event={event} className="mt-1.5" />
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-5 py-4">
                              <SeatsBadge event={event} />
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => toggleAttendees(event.id)}
                                  aria-expanded={!!openAttendees[event.id]}
                                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-medium text-muted transition-colors hover:bg-paper hover:text-ink"
                                >
                                  <Users size={15} />
                                  {attendees[event.id]?.length ?? '…'}
                                </button>
                                <button
                                  onClick={() => startEdit(event)}
                                  aria-label={`Edit ${event.title}`}
                                  className="min-h-[44px] min-w-[44px] rounded-full border border-line p-2.5 transition-colors hover:bg-paper"
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  onClick={() =>
                                    setDeleteTarget({ id: event.id, title: event.title })
                                  }
                                  aria-label={`Delete ${event.title}`}
                                  className="min-h-[44px] min-w-[44px] rounded-full border border-line p-2.5 text-danger transition-colors hover:bg-danger-bg"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {openAttendees[event.id] && (
                            <tr key={`${event.id}-attendees`}>
                              <td colSpan={5} className="bg-paper/60 px-5 py-4 sm:px-6">
                                <p className="text-sm font-semibold">
                                  Attendees
                                  {attendees[event.id] && (
                                    <span className="ml-2 rounded-full bg-card px-2 py-0.5 text-xs font-medium tabular-nums text-muted ring-1 ring-line">
                                      {attendees[event.id].length}
                                    </span>
                                  )}
                                </p>
                                <div className="mt-3 text-sm">
                                  {attendeeErrors[event.id] && !attendees[event.id] ? (
                                    <p className="text-danger">
                                      {attendeeErrors[event.id]}{' '}
                                      <button
                                        onClick={() => loadAttendees(event.id)}
                                        className="font-medium underline"
                                      >
                                        Retry
                                      </button>
                                    </p>
                                  ) : !attendees[event.id] ? (
                                    <p className="text-muted">Loading…</p>
                                  ) : attendees[event.id].length === 0 ? (
                                    <p className="text-muted">No bookings yet.</p>
                                  ) : (
                                    <ul className="grid gap-2 sm:grid-cols-2">
                                      {attendees[event.id].map((a) => (
                                        <li
                                          key={a.id}
                                          className="flex items-center gap-2.5 rounded-2xl border border-line bg-card px-3 py-2"
                                        >
                                          <span
                                            aria-hidden="true"
                                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarTint(a.email)}`}
                                          >
                                            {initials(a.email)}
                                          </span>
                                          <span className="min-w-0 flex-1 truncate text-muted">
                                            {a.email}
                                          </span>
                                          <span className="shrink-0 rounded-full bg-ok-bg px-2 py-0.5 text-[11px] font-semibold text-ok-ink">
                                            Confirmed
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <button
                    onClick={() => loadEvents(page - 1)}
                    disabled={page <= 1 || loading}
                    className="inline-flex min-h-[44px] items-center rounded-full border border-line px-5 text-sm font-medium transition-colors hover:bg-paper disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <p className="text-sm tabular-nums text-muted">
                    Page {page} of {totalPages}
                  </p>
                  <button
                    onClick={() => loadEvents(page + 1)}
                    disabled={page >= totalPages || loading}
                    className="inline-flex min-h-[44px] items-center rounded-full border border-line px-5 text-sm font-medium transition-colors hover:bg-paper disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
        >
          <div className="w-full max-w-sm rounded-4xl border border-line bg-card p-6">
            <h2 id="delete-title" className="font-display text-lg font-bold tracking-tight">
              Delete event
            </h2>
            <p className="mt-2 text-sm text-muted">
              Delete &ldquo;{deleteTarget.title}&rdquo;? Events with bookings cannot be deleted.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="min-h-[44px] flex-1 rounded-full border border-line px-5 text-sm font-medium transition-colors hover:bg-paper"
              >
                Keep
              </button>
              <button
                onClick={confirmDelete}
                className="min-h-[44px] flex-1 rounded-full bg-danger px-5 text-sm font-semibold text-white transition-colors hover:bg-danger/90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
