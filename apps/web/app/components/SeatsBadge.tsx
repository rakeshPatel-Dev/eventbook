import type { ApiEvent } from '../../lib/api';

export function isPastEvent(startsAt: string): boolean {
  return new Date(startsAt).getTime() <= Date.now();
}

export function calendarParts(startsAt: string): { month: string; day: string } {
  const date = new Date(startsAt);
  return {
    month: date.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: String(date.getDate()),
  };
}

export function formatDateTime(startsAt: string): string {
  return new Date(startsAt).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Availability pill. Past and full states are display-only; the backend
// re-checks every booking attempt.
export function SeatsBadge({ event }: { event: ApiEvent }) {
  if (isPastEvent(event.startsAt)) {
    return (
      <span className="rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600">
        Past event
      </span>
    );
  }
  if (event.seatsLeft <= 0) {
    return (
      <span className="rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600">
        Full
      </span>
    );
  }
  if (event.seatsLeft <= 3) {
    return (
      <span className="rounded-full bg-warn-bg px-2.5 py-1 text-xs font-semibold text-warn-ink">
        Only {event.seatsLeft} left
      </span>
    );
  }
  return (
    <span className="rounded-full bg-ok-bg px-2.5 py-1 text-xs font-medium text-ok-ink">
      {event.seatsLeft} seats left
    </span>
  );
}
