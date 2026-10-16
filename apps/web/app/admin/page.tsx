'use client';

import { CalendarPlus, Pencil, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { api, apiErrorMessage, type ApiEvent, type ApiUser } from '../../lib/api';
import Nav from '../components/Nav';
import { formatDateTime } from '../components/SeatsBadge';

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
  'mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 outline-none placeholder:text-faint focus:border-primary';

function toInputValue(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16);
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

const titleRules = { required: 'Title is required.' };
const venueRules = { required: 'Venue is required.' };
const startsAtRules = { required: 'Start date and time are required.' };
const seatsRules = {
  required: 'Seats are required.',
  min: { value: 1, message: 'Seats must be at least 1.' },
  validate: (v: number) => Number.isInteger(Number(v)) || 'Seats must be a whole number.',
};

export default function AdminPage() {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<Record<string, Attendee[]>>({});
  const [openAttendees, setOpenAttendees] = useState<Record<string, boolean>>({});

  const createForm = useForm<EventForm>({ defaultValues: EMPTY_FORM });
  const editForm = useForm<EventForm>({ defaultValues: EMPTY_FORM });

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status, data } = await api<{ events: ApiEvent[] }>('/api/events?scope=all&limit=50');
      if (status === 200 && data) {
        setEvents(data.events);
      } else {
        setError('Could not load events.');
      }
    } catch {
      setError('Could not reach the API. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function check() {
      try {
        const { status, data } = await api<{ user: ApiUser }>('/api/auth/me');
        const me = status === 200 && data ? data.user : null;
        setUser(me);
        if (me?.role === 'admin') {
          await loadEvents();
        }
      } finally {
        setChecking(false);
      }
    }
    void check();
  }, [loadEvents]);

  async function create(values: EventForm) {
    setMessage(null);
    setError(null);
    try {
      const { status, data } = await api('/api/events', {
        method: 'POST',
        body: JSON.stringify(toPayload(values)),
      });
      if (status === 201) {
        createForm.reset(EMPTY_FORM);
        setMessage('Event created.');
        await loadEvents();
      } else {
        setError(apiErrorMessage(data, 'Could not create the event.'));
      }
    } catch {
      setError('Could not reach the API. Is the backend running?');
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
    setMessage(null);
    setError(null);
  }

  async function saveEdit(values: EventForm) {
    if (!editingId) {
      return;
    }
    setMessage(null);
    setError(null);
    try {
      const { status, data } = await api(`/api/events/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(toPayload(values)),
      });
      if (status === 200) {
        setEditingId(null);
        setMessage('Event updated.');
        await loadEvents();
      } else {
        setError(apiErrorMessage(data, 'Could not update the event.'));
      }
    } catch {
      setError('Could not reach the API. Is the backend running?');
    }
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete “${title}”? Events with bookings cannot be deleted.`)) {
      return;
    }
    setMessage(null);
    setError(null);
    try {
      const { status, data } = await api(`/api/events/${id}`, { method: 'DELETE' });
      if (status === 200) {
        setMessage('Event deleted.');
        await loadEvents();
      } else {
        setError(apiErrorMessage(data, 'Could not delete the event.'));
      }
    } catch {
      setError('Could not reach the API. Is the backend running?');
    }
  }

  async function toggleAttendees(id: string) {
    const open = !openAttendees[id];
    setOpenAttendees((prev) => ({ ...prev, [id]: open }));
    if (open && !attendees[id]) {
      try {
        const { status, data } = await api<{ attendees: Attendee[] }>(
          `/api/events/${id}/attendees`,
        );
        if (status === 200 && data) {
          setAttendees((prev) => ({ ...prev, [id]: data.attendees }));
        }
      } catch {
        // Attendee load failure stays silent; the list itself already loaded.
      }
    }
  }

  function formFields(form: typeof createForm, submitLabel: string, onCancel?: () => void) {
    const {
      register,
      handleSubmit,
      formState: { errors, isSubmitting },
    } = form;
    const submit = form === createForm ? create : saveEdit;
    return (
      <form onSubmit={handleSubmit(submit)} className="space-y-3" noValidate>
        <div>
          <input
            placeholder="Title"
            aria-label="Title"
            {...register('title', titleRules)}
            className={inputClass}
          />
          {errors.title && <p className="mt-1 text-sm text-danger">{errors.title.message}</p>}
        </div>
        <div>
          <textarea
            placeholder="Description (optional)"
            aria-label="Description"
            {...register('description')}
            className={inputClass}
          />
        </div>
        <div>
          <input
            placeholder="Venue"
            aria-label="Venue"
            {...register('venue', venueRules)}
            className={inputClass}
          />
          {errors.venue && <p className="mt-1 text-sm text-danger">{errors.venue.message}</p>}
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <input
              type="datetime-local"
              aria-label="Starts at"
              {...register('startsAt', startsAtRules)}
              className={inputClass}
            />
            {errors.startsAt && (
              <p className="mt-1 text-sm text-danger">{errors.startsAt.message}</p>
            )}
          </div>
          <div className="w-28">
            <input
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
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : submitLabel}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium"
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
        <p className="mx-auto max-w-2xl px-4 py-8 text-sm text-muted">Checking session…</p>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-2xl px-4 py-8">
          <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-4 text-sm text-muted">
            This area is for admins only.{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
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
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">Manage events</h1>
        <p className="mt-1 text-sm text-muted">Create, edit, delete, and see who booked.</p>
        {message && <p className="mt-3 text-sm font-medium text-ok-ink">{message}</p>}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <section className="mt-6 rounded-xl bg-card p-5 shadow-sm">
          <h2 className="inline-flex items-center gap-2 font-semibold">
            <CalendarPlus size={17} /> Create event
          </h2>
          <div className="mt-3">{formFields(createForm, 'Create event')}</div>
        </section>

        <section className="mt-8">
          <h2 className="font-semibold">All events</h2>
          {loading ? (
            <p className="mt-2 text-sm text-muted">Loading events…</p>
          ) : events.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No events yet. Create one above.</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {events.map((event) => (
                <li key={event.id} className="rounded-xl bg-card p-5 shadow-sm">
                  {editingId === event.id ? (
                    formFields(editForm, 'Save changes', () => setEditingId(null))
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{event.title}</p>
                          <p className="mt-1 text-sm text-muted">
                            {formatDateTime(event.startsAt)} · {event.venue} · {event.seatsLeft} of{' '}
                            {event.totalSeats} left
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            onClick={() => startEdit(event)}
                            aria-label={`Edit ${event.title}`}
                            className="rounded-lg border border-line p-2 transition-colors hover:bg-paper"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => remove(event.id, event.title)}
                            aria-label={`Delete ${event.title}`}
                            className="rounded-lg border border-line p-2 text-danger transition-colors hover:bg-danger-bg"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleAttendees(event.id)}
                        className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
                      >
                        <Users size={15} />
                        {openAttendees[event.id] ? 'Hide attendees' : 'Show attendees'}
                      </button>
                      {openAttendees[event.id] && (
                        <div className="mt-2 text-sm">
                          {!attendees[event.id] ? (
                            <p className="text-muted">Loading…</p>
                          ) : attendees[event.id].length === 0 ? (
                            <p className="text-muted">No bookings yet.</p>
                          ) : (
                            <ul className="list-disc pl-5 text-muted">
                              {attendees[event.id].map((a) => (
                                <li key={a.id}>{a.email}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
