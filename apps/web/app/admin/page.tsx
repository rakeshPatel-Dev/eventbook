'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, apiErrorMessage, type ApiEvent, type ApiUser } from '../../lib/api';
import Nav from '../components/Nav';

interface Attendee {
  id: string;
  userId: string;
  email: string;
  createdAt: string;
}

const EMPTY_FORM = { title: '', description: '', venue: '', startsAt: '', totalSeats: '' };

function toInputValue(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16);
}

export default function AdminPage() {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [attendees, setAttendees] = useState<Record<string, Attendee[]>>({});
  const [openAttendees, setOpenAttendees] = useState<Record<string, boolean>>({});

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

  async function create() {
    setMessage(null);
    setError(null);
    try {
      const { status, data } = await api('/api/events', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          venue: form.venue,
          starts_at: form.startsAt ? new Date(form.startsAt).toISOString() : form.startsAt,
          total_seats: Number(form.totalSeats),
        }),
      });
      if (status === 201) {
        setForm(EMPTY_FORM);
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
    setEditForm({
      title: event.title,
      description: event.description,
      venue: event.venue,
      startsAt: toInputValue(event.startsAt),
      totalSeats: String(event.totalSeats),
    });
    setMessage(null);
    setError(null);
  }

  async function saveEdit(id: string) {
    setMessage(null);
    setError(null);
    try {
      const { status, data } = await api(`/api/events/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          venue: editForm.venue,
          starts_at: editForm.startsAt
            ? new Date(editForm.startsAt).toISOString()
            : editForm.startsAt,
          total_seats: Number(editForm.totalSeats),
        }),
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

  if (checking) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <p className="mx-auto max-w-2xl px-4 py-8 text-sm text-zinc-600">Checking session…</p>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <main className="mx-auto max-w-2xl px-4 py-8">
          <h1 className="text-2xl font-semibold text-zinc-900">Admin</h1>
          <p className="mt-4 text-sm text-zinc-600">
            This area is for admins only.{' '}
            <Link href="/login" className="underline">
              Log in
            </Link>{' '}
            with an admin account.
          </p>
        </main>
      </div>
    );
  }

  const inputClass = 'mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900';

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Manage events</h1>
        {message && <p className="mt-2 text-sm text-green-700">{message}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <section className="mt-6 rounded border border-zinc-200 bg-white p-4">
          <h2 className="font-medium text-zinc-900">Create event</h2>
          <div className="mt-3 space-y-3">
            <input
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputClass}
            />
            <textarea
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inputClass}
            />
            <input
              placeholder="Venue"
              value={form.venue}
              onChange={(e) => setForm({ ...form, venue: e.target.value })}
              className={inputClass}
            />
            <div className="flex gap-3">
              <input
                type="datetime-local"
                aria-label="Starts at"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                className={inputClass}
              />
              <input
                type="number"
                min={1}
                placeholder="Seats"
                aria-label="Total seats"
                value={form.totalSeats}
                onChange={(e) => setForm({ ...form, totalSeats: e.target.value })}
                className={inputClass}
              />
            </div>
            <button onClick={create} className="rounded bg-zinc-900 px-4 py-2 text-sm text-white">
              Create event
            </button>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-medium text-zinc-900">All events</h2>
          {loading ? (
            <p className="mt-2 text-sm text-zinc-600">Loading events…</p>
          ) : events.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">No events yet. Create one above.</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {events.map((event) => (
                <li key={event.id} className="rounded border border-zinc-200 bg-white p-4">
                  {editingId === event.id ? (
                    <div className="space-y-3">
                      <input
                        aria-label="Title"
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        className={inputClass}
                      />
                      <textarea
                        aria-label="Description"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className={inputClass}
                      />
                      <input
                        aria-label="Venue"
                        value={editForm.venue}
                        onChange={(e) => setEditForm({ ...editForm, venue: e.target.value })}
                        className={inputClass}
                      />
                      <div className="flex gap-3">
                        <input
                          type="datetime-local"
                          aria-label="Starts at"
                          value={editForm.startsAt}
                          onChange={(e) => setEditForm({ ...editForm, startsAt: e.target.value })}
                          className={inputClass}
                        />
                        <input
                          type="number"
                          min={1}
                          aria-label="Total seats"
                          value={editForm.totalSeats}
                          onChange={(e) => setEditForm({ ...editForm, totalSeats: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                      <div className="space-x-3">
                        <button
                          onClick={() => saveEdit(event.id)}
                          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded border border-zinc-300 px-3 py-1 text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-zinc-900">{event.title}</p>
                          <p className="mt-1 text-sm text-zinc-600">
                            {new Date(event.startsAt).toLocaleString()} · {event.venue} ·{' '}
                            {event.seatsLeft} of {event.totalSeats} left
                          </p>
                        </div>
                        <div className="shrink-0 space-x-3 text-sm">
                          <button onClick={() => startEdit(event)} className="underline">
                            Edit
                          </button>
                          <button
                            onClick={() => remove(event.id, event.title)}
                            className="underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleAttendees(event.id)}
                        className="mt-2 text-sm text-zinc-600 underline"
                      >
                        {openAttendees[event.id] ? 'Hide attendees' : 'Show attendees'}
                      </button>
                      {openAttendees[event.id] && (
                        <div className="mt-2 text-sm text-zinc-700">
                          {!attendees[event.id] ? (
                            <p>Loading…</p>
                          ) : attendees[event.id].length === 0 ? (
                            <p>No bookings yet.</p>
                          ) : (
                            <ul className="list-disc pl-5">
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
