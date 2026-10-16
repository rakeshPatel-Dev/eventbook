import { ArrowRight, MapPin } from 'lucide-react';
import Link from 'next/link';
import type { ApiEvent } from '../../lib/api';
import { calendarParts, formatDateTime, SeatsBadge } from './SeatsBadge';

// Card header uses a solid tint block with the calendar badge: our events
// have no photos, so no external images are hotlinked.
export default function EventCard({ event }: { event: ApiEvent }) {
  const cal = calendarParts(event.startsAt);
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      <div className="relative bg-gradient-to-br from-primary-soft via-paper to-line px-4 pb-3 pt-4">
        <div className="flex items-start justify-between">
          <div className="flex min-w-[3rem] flex-col items-center overflow-hidden rounded-lg bg-card shadow">
            <span className="w-full bg-ink px-2 py-0.5 text-center text-[0.7rem] font-bold tracking-widest text-card">
              {cal.month}
            </span>
            <span className="px-2 py-0.5 text-xl font-bold leading-tight">{cal.day}</span>
          </div>
          <SeatsBadge event={event} />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <p className="text-sm text-muted">{formatDateTime(event.startsAt)}</p>
          <h3 className="mt-1 text-lg font-semibold leading-snug group-hover:text-primary">
            {event.title}
          </h3>
          {event.description && (
            <p className="mt-2 line-clamp-2 text-sm text-muted">{event.description}</p>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <span className="flex max-w-[160px] items-center gap-1 truncate text-sm text-muted">
            <MapPin size={16} className="shrink-0" />
            <span className="truncate">{event.venue}</span>
          </span>
          <Link
            href={`/events/${event.id}`}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-paper px-3 py-1.5 text-sm font-medium transition-colors hover:text-primary"
          >
            View details <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}
