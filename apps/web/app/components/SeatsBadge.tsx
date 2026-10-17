import type { ApiEvent } from '../../lib/api';

export function isPastEvent(startsAt: string): boolean {
  return new Date(startsAt).getTime() <= Date.now();
}

export interface CalendarParts {
  month: string;
  day: string;
  weekday: string;
  year: string;
  time: string;
  relative: string;
  iso: string;
}

function relativeLabel(startsAt: string): string {
  const now = Date.now();
  const t = new Date(startsAt).getTime();
  const diff = t - now;
  const abs = Math.abs(diff);
  const day = 24 * 60 * 60 * 1000;
  if (abs < day) {
    return diff >= 0 ? 'Today' : 'Earlier today';
  }
  const days = Math.round(abs / day);
  if (days === 1) {
    return diff >= 0 ? 'Tomorrow' : 'Yesterday';
  }
  if (days < 7) {
    return diff >= 0 ? `In ${days} days` : `${days} days ago`;
  }
  const weeks = Math.round(days / 7);
  if (weeks < 5) {
    return diff >= 0
      ? `In ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`
      : `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  return '';
}

export function calendarParts(startsAt: string): CalendarParts {
  const date = new Date(startsAt);
  const time = date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' });
  return {
    month: date.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: String(date.getDate()),
    weekday: date.toLocaleString('en-US', { weekday: 'short' }),
    year: String(date.getFullYear()),
    time,
    relative: relativeLabel(startsAt),
    iso: date.toISOString(),
  };
}

export function formatDateLong(startsAt: string): string {
  return new Date(startsAt).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime(startsAt: string): string {
  return new Date(startsAt).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Fixed-width date rail. Tabular numerals + fixed column keep every card
// on the same baseline grid regardless of day width ("8" vs "24").
export function DateRail({
  startsAt,
  size = 'md',
  dimmed = false,
}: {
  startsAt: string;
  size?: 'sm' | 'md' | 'lg';
  dimmed?: boolean;
}) {
  const cal = calendarParts(startsAt);
  const daySize = size === 'lg' ? 'text-6xl' : size === 'sm' ? 'text-3xl' : 'text-[2.5rem]';
  return (
    <div className="w-[68px] shrink-0">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-faint">{cal.month}</p>
      <p
        className={`font-display font-bold tabular-nums leading-[0.95] tracking-tight ${daySize} ${
          dimmed ? 'text-muted' : ''
        }`}
      >
        <time dateTime={cal.iso}>{cal.day}</time>
      </p>
      <p className="mt-1.5 text-xs tabular-nums text-muted">
        {cal.weekday} · {cal.year.slice(2)}
      </p>
    </div>
  );
}

// Availability levels drive every color choice on cards, detail, and admin.
// Scale is percentage-based: green → yellow → amber → red → sold out.
// past = ended. Booked is orthogonal (viewer holds a seat) and layers on top.
export type EventState = 'plenty' | 'moderate' | 'tight' | 'critical' | 'soldout' | 'past';

export function eventState(event: ApiEvent): EventState {
  if (isPastEvent(event.startsAt)) {
    return 'past';
  }
  if (event.seatsLeft <= 0) {
    return 'soldout';
  }
  const left = event.totalSeats > 0 ? event.seatsLeft / event.totalSeats : 0;
  if (event.seatsLeft <= 2 || left < 0.1) {
    return 'critical';
  }
  if (left < 0.25) {
    return 'tight';
  }
  if (left <= 0.5) {
    return 'moderate';
  }
  return 'plenty';
}

export function capacityPct(event: ApiEvent): number {
  if (event.totalSeats <= 0) {
    return 0;
  }
  const taken = Math.max(0, event.totalSeats - event.seatsLeft);
  return Math.min(100, Math.round((taken / event.totalSeats) * 100));
}

const METER_FILL: Record<EventState, string> = {
  plenty: 'bg-ok-ink',
  moderate: 'bg-yellow-500',
  tight: 'bg-amber-500',
  critical: 'bg-red-600',
  soldout: 'bg-red-900',
  past: 'bg-faint',
};

// Thin capacity meter. Text fraction always accompanies it so color
// is never the only indicator.
export function CapacityMeter({ event, className = '' }: { event: ApiEvent; className?: string }) {
  const state = eventState(event);
  const pct = capacityPct(event);
  const taken = Math.max(0, event.totalSeats - event.seatsLeft);
  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-line/80 ${className}`}
      role="progressbar"
      aria-valuenow={taken}
      aria-valuemin={0}
      aria-valuemax={event.totalSeats}
      aria-label={`${taken} of ${event.totalSeats} seats taken`}
    >
      <div
        className={`h-full rounded-full transition-[width] ${METER_FILL[state]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
// Availability pill. Sold out and past are display-only; the backend
// re-checks every booking attempt.
export function SeatsBadge({ event }: { event: ApiEvent }) {
  const state = eventState(event);
  const pill = 'inline-flex h-[26px] items-center rounded-full px-2.5 text-xs font-semibold';
  if (state === 'past') {
    return (
      <span className={`${pill} border border-line bg-line/70 font-medium text-muted`}>Ended</span>
    );
  }
  if (state === 'soldout') {
    return <span className={`${pill} bg-red-900 text-white`}>Sold out</span>;
  }
  if (state === 'critical') {
    return (
      <span className={`${pill} bg-red-600 text-white`}>
        {event.seatsLeft === 1 ? 'Last seat' : `Only ${event.seatsLeft} left`}
      </span>
    );
  }
  if (state === 'tight') {
    return (
      <span className={`${pill} border border-amber-200 bg-amber-100 text-amber-800`}>
        Only {event.seatsLeft} left
      </span>
    );
  }
  if (state === 'moderate') {
    return (
      <span
        className={`${pill} border border-yellow-200 bg-yellow-100 font-medium tabular-nums text-yellow-800`}
      >
        {event.seatsLeft} seats left
      </span>
    );
  }
  return (
    <span className={`${pill} border border-line bg-ok-bg font-medium tabular-nums text-ok-ink`}>
      {event.seatsLeft} seats left
    </span>
  );
}
