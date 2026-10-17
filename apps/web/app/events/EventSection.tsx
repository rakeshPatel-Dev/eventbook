'use client';

import { ChevronLeft, ChevronRight, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type ApiEvent, type Pagination } from '../../lib/api';
import EventCard from '../components/EventCard';
import { CardSkeletonGrid, EmptyState, ErrorState } from '../components/Feedback';
import { useMyBookings } from '../components/MyBookings';
import { useToast } from '../components/Toast';

interface SectionProps {
  title: string;
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
    <div className="mt-8 flex items-center justify-between gap-4 text-sm">
      <button
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-line bg-card px-5 py-2 transition-colors hover:bg-paper disabled:opacity-50"
      >
        <ChevronLeft size={15} /> Previous
      </button>
      <span className="text-muted">
        Page {pagination.page} of {pagination.totalPages}
      </span>
      <button
        disabled={page >= pagination.totalPages}
        onClick={() => onPage(page + 1)}
        className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-line bg-card px-5 py-2 transition-colors hover:bg-paper disabled:opacity-50"
      >
        Next <ChevronRight size={15} />
      </button>
    </div>
  );
}

export function EventSection({ title, search, emptyHint }: SectionProps) {
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const { error: toastError } = useToast();
  const { confirmedIds } = useMyBookings();

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(page), limit: '9' });
        if (search) {
          params.set('search', search);
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
          const msg = 'Could not load events. The list may be stale.';
          setError(msg);
          toastError('Events failed to load', msg);
        }
      } catch {
        if (!cancelled) {
          const msg = 'Could not reach the API. Check your connection and retry.';
          setError(msg);
          toastError('Network error', msg);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [search, page, retryKey]);

  return (
    <section aria-label={title || 'Upcoming events'}>
      {title && (
        <div className="flex items-baseline gap-3 border-b border-ink/15 pb-4">
          <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
          {pagination && !loading && (
            <span className="rounded-full border border-line bg-card px-2.5 py-0.5 text-xs font-medium text-muted">
              {pagination.total} {pagination.total === 1 ? 'event' : 'events'}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <CardSkeletonGrid />
      ) : error ? (
        <ErrorState
          title="Could not load events"
          message={error}
          onRetry={() => setRetryKey((k) => k + 1)}
        />
      ) : events.length === 0 ? (
        <EmptyState icon={<SearchX size={24} />} title="No events found" message={emptyHint} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 pt-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} booked={confirmedIds.has(event.id)} />
            ))}
          </div>
          {pagination && <Pager pagination={pagination} page={page} onPage={setPage} />}
        </>
      )}
    </section>
  );
}
