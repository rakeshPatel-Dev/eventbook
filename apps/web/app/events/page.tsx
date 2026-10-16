'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type ApiEvent, type Pagination } from '../../lib/api';
import Nav from '../components/Nav';

function seatsLabel(event: ApiEvent): { text: string; className: string } {
  if (new Date(event.startsAt).getTime() <= Date.now()) {
    return { text: 'Past event', className: 'bg-zinc-200 text-zinc-600' };
  }
  if (event.seatsLeft <= 0) {
    return { text: 'Full', className: 'bg-red-100 text-red-700' };
  }
  if (event.seatsLeft <= 3) {
    return {
      text: `Only ${event.seatsLeft} left`,
      className: 'bg-amber-100 text-amber-800',
    };
  }
  return {
    text: `${event.seatsLeft} seats left`,
    className: 'bg-green-100 text-green-800',
  };
}

export default function EventsPage() {
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCommittedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(page), limit: '10' });
        if (committedSearch) {
          params.set('search', committedSearch);
        }
        const { status, data } = await api<{ events: ApiEvent[]; pagination: Pagination }>(
          `/api/events?${params.toString()}`,
        );
        if (cancelled) {
          return;
        }
        if (status === 200 && data) {
          setEvents(data.events);
          setPagination(data.pagination);
        } else {
          setError('Could not load events.');
        }
      } catch {
        if (!cancelled) {
          setError('Could not reach the API. Is the backend running?');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [committedSearch, page]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Upcoming events</h1>
        <input
          type="search"
          placeholder="Search by title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-4 w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
        />
        {loading ? (
          <p className="mt-6 text-sm text-zinc-600">Loading events…</p>
        ) : error ? (
          <p className="mt-6 text-sm text-red-600">{error}</p>
        ) : events.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-600">
            {committedSearch ? `No events match “${committedSearch}”.` : 'No upcoming events yet.'}
          </p>
        ) : (
          <>
            <ul className="mt-6 space-y-4">
              {events.map((event) => {
                const seats = seatsLabel(event);
                return (
                  <li key={event.id} className="rounded border border-zinc-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/events/${event.id}`}
                          className="font-medium text-zinc-900 underline"
                        >
                          {event.title}
                        </Link>
                        <p className="mt-1 text-sm text-zinc-600">
                          {new Date(event.startsAt).toLocaleString()} · {event.venue}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${seats.className}`}
                      >
                        {seats.text}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {pagination && pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between text-sm">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-zinc-600">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} events)
                </span>
                <button
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
