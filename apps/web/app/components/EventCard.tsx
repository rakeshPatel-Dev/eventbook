import { ArrowUpRight, CheckCircle2, MapPin } from 'lucide-react';
import Link from 'next/link';
import type { ApiEvent } from '../../lib/api';
import {
  calendarParts,
  CapacityMeter,
  capacityPct,
  DateRail,
  eventState,
  isPastEvent,
  SeatsBadge,
} from './SeatsBadge';

// Uniform poster card: fixed 68px date rail + hairline rule + content.
// No spanning variant — every card shares the same grid so rows align.
// Rail uses tabular-nums so "8" and "24" never shift the layout.
export default function EventCard({
  event,
  booked = false,
}: {
  event: ApiEvent;
  booked?: boolean;
  featured?: boolean;
}) {
  const cal = calendarParts(event.startsAt);
  const past = isPastEvent(event.startsAt);
  const full = !past && event.seatsLeft <= 0;
  const bookedActive = booked && !past;
  const state = eventState(event);
  const pct = capacityPct(event);

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-4xl border bg-card transition-colors hover:border-ink/30 ${
        bookedActive ? 'border-ok-ink/50' : 'border-line'
      } ${past ? 'opacity-90' : ''}`}
    >
      <div className="flex items-start gap-4 p-5 sm:p-6">
        <DateRail startsAt={event.startsAt} dimmed={past} />
        <div aria-hidden="true" className="w-px self-stretch bg-line" />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-0.5">
          <div className="flex min-h-[26px] flex-wrap items-center gap-1.5">
            <SeatsBadge event={event} />
            {bookedActive && (
              <span className="inline-flex h-[26px] items-center gap-1 rounded-full bg-ok-bg px-2.5 text-xs font-semibold text-ok-ink">
                <CheckCircle2 size={12} /> Booked
              </span>
            )}
            {past && booked && (
              <span className="inline-flex h-[26px] items-center gap-1 rounded-full bg-ok-bg px-2.5 text-xs font-medium text-ok-ink">
                <CheckCircle2 size={12} /> Attended
              </span>
            )}
          </div>
          <p className="text-xs tabular-nums text-muted">
            {cal.relative && !past ? (
              <>
                <span className="font-semibold text-ink">{cal.relative}</span>
                <span aria-hidden="true"> · </span>
              </>
            ) : null}
            <time dateTime={cal.iso}>
              {cal.weekday}, {cal.time}
            </time>
          </p>
        </div>
      </div>

      <div aria-hidden="true" className="ticket-edge mx-5 sm:mx-6" />

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className="font-display text-lg font-bold leading-[1.2] tracking-tight group-hover:text-primary-deep">
          <Link href={`/events/${event.id}`} className="transition-colors">
            {event.title}
          </Link>
        </h3>
        {event.description && (
          <p className="mt-2 line-clamp-2 min-h-[2.6em] text-sm leading-relaxed text-muted">
            {event.description}
          </p>
        )}
        <div className="mt-auto pt-4">
          <CapacityMeter event={event} />
          <div className="mt-2 flex items-center gap-3 text-sm">
            <span className="flex min-w-0 flex-1 items-center gap-2 text-muted">
              <MapPin size={15} className="h-[15px] w-[15px] shrink-0 text-faint" />
              <span className="truncate">{event.venue}</span>
            </span>
            <span className="w-[136px] shrink-0 text-right text-xs tabular-nums text-faint">
              {state === 'soldout' ? (
                <>Sold out</>
              ) : state === 'past' ? (
                <>Ended</>
              ) : (
                <>
                  {event.seatsLeft}/{event.totalSeats} · {pct}% full
                </>
              )}
            </span>
          </div>
          <div className="mt-3">
            <Link
              href={`/events/${event.id}`}
              className={`inline-flex min-h-[44px] items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                bookedActive
                  ? 'bg-ok-bg text-ok-ink hover:bg-ok-bg/70'
                  : full || past
                    ? 'border border-line text-ink hover:bg-paper'
                    : 'bg-primary text-ink hover:bg-primary-hover'
              }`}
            >
              {booked && !past
                ? 'View booking'
                : full
                  ? 'View event'
                  : past
                    ? 'View recap'
                    : 'View details'}
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
