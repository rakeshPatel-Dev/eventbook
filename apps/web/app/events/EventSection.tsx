'use client';

import { ChevronLeft, ChevronRight, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type ApiEvent, type Pagination } from '../../lib/api';
import EventCard from '../components/EventCard';

interface SectionProps {
  title: string;
  pastOnly: boolean;
  search: string;
  emptyHint: string;
}

function Pager({
  pagination,
  page,
  onPage,
}: {
  pagination: Pagination;
  page: number;
  onPage: (page: number) => void;
}) {
  if (pagination.totalPages <= 1) {
    return null;
  }
  return (
    <div className="mt-8 flex items-center justify-between text-sm">
      <button
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 disabled:opacity-50"
      >
        <ChevronLeft size={15} /> Previous
      </button>
      <span className="text-muted">
        Page {pagination.page} of {pagination.totalPages}
      </span>
      <button
        disabled={page >= pagination.totalPages}
        onClick={() => onPage(page + 1)}
        className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-3 py-1.5 disabled:opacity-50"
      >
        Next <ChevronRight size={15} />
      </button>
    </div>
  );
}

export function EventSection({ title, pastOnly, search, emptyHint }: SectionProps) {
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [search, pastOnly]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(page), limit: '9' });
        if (search) {
          params.set('search', search);
        }
        if (pastOnly) {
          params.set('past_only', 'true');
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
  }, [search, page, pastOnly]);

  return (
    <section className="pb-4">
      <div className="flex items-baseline gap-3 border-b border-line pb-4">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {pagination && (
          <span className="rounded-full bg-line px-2.5 py-0.5 text-xs font-medium text-muted">
            {pagination.total} {pagination.total === 1 ? 'event' : 'events'}
          </span>
        )}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-muted">Loading events…</p>
      ) : error ? (
        <p className="mt-6 text-sm text-danger">{error}</p>
      ) : events.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-2xl bg-card px-6 py-10 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper text-faint">
            <SearchX size={24} />
          </span>
          <h3 className="mt-3 font-semibold">No events found</h3>
          <p className="mt-1 max-w-md text-sm text-muted">{emptyHint}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 pt-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
          {pagination && <Pager pagination={pagination} page={page} onPage={setPage} />}
        </>
      )}
    </section>
  );
}
