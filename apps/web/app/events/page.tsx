'use client';

import { ChevronLeft, ChevronRight, Search, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type ApiEvent, type Pagination } from '../../lib/api';
import EventCard from '../components/EventCard';
import Nav from '../components/Nav';

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
        const params = new URLSearchParams({ page: String(page), limit: '9' });
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
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-5xl px-4">
        <section className="pb-8 pt-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Curated local gatherings
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Find your next experience.</h1>
          <p className="mt-2 max-w-xl text-muted">
            Workshops, meetups, and live sessions — with live seat availability.
          </p>
          <div className="mt-6 flex items-center rounded-xl bg-card p-2 shadow-md">
            <Search size={20} className="ml-3 shrink-0 text-faint" />
            <input
              type="search"
              aria-label="Search events by title"
              placeholder="Search events by title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent px-3 py-2 text-ink outline-none placeholder:text-faint"
            />
          </div>
        </section>

        <section className="pb-16">
          <div className="flex items-baseline gap-3 border-b border-line pb-4">
            <h2 className="text-2xl font-semibold tracking-tight">Upcoming events</h2>
            {pagination && (
              <span className="rounded-full bg-line px-2.5 py-0.5 text-xs font-medium text-muted">
                {pagination.total} {pagination.total === 1 ? 'event' : 'events'}
              </span>
            )}
          </div>

          {loading ? (
            <p className="mt-8 text-sm text-muted">Loading events…</p>
          ) : error ? (
            <p className="mt-8 text-sm text-danger">{error}</p>
          ) : events.length === 0 ? (
            <div className="mt-8 flex flex-col items-center rounded-2xl bg-card px-6 py-12 text-center shadow-sm">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper text-faint">
                <SearchX size={24} />
              </span>
              <h3 className="mt-3 font-semibold">No events found</h3>
              <p className="mt-1 max-w-md text-sm text-muted">
                {committedSearch
                  ? `Nothing matches “${committedSearch}”. Try a different title.`
                  : 'No upcoming events yet. Check back soon.'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 pt-6 md:grid-cols-2 lg:grid-cols-3">
                {events.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
              {pagination && pagination.totalPages > 1 && (
                <div className="mt-8 flex items-center justify-between text-sm">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 disabled:opacity-50"
                  >
                    <ChevronLeft size={15} /> Previous
                  </button>
                  <span className="text-muted">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 disabled:opacity-50"
                  >
                    Next <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
