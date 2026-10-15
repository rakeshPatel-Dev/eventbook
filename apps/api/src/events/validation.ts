export const MAX_TITLE_LENGTH = 200;
export const MAX_VENUE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_LIST_LIMIT = 50;

export interface ParsedEvent {
  title?: string;
  description?: string;
  venue?: string;
  startsAt?: string;
  totalSeats?: number;
}

function nonEmptyString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

// Validates event input. On create every required field must be present;
// on update only the provided fields are checked.
export function validateEventBody(
  body: Record<string, unknown>,
  forUpdate: boolean,
): { error?: string; value?: ParsedEvent } {
  const value: ParsedEvent = {};

  if (!forUpdate || body.title !== undefined) {
    const title = nonEmptyString(body.title, MAX_TITLE_LENGTH);
    if (!title) {
      return { error: `Title is required (1-${MAX_TITLE_LENGTH} characters).` };
    }
    value.title = title;
  }
  if (!forUpdate || body.venue !== undefined) {
    const venue = nonEmptyString(body.venue, MAX_VENUE_LENGTH);
    if (!venue) {
      return { error: `Venue is required (1-${MAX_VENUE_LENGTH} characters).` };
    }
    value.venue = venue;
  }
  if (!forUpdate || body.description !== undefined) {
    if (body.description === undefined) {
      if (!forUpdate) {
        value.description = '';
      }
    } else {
      if (
        typeof body.description !== 'string' ||
        body.description.length > MAX_DESCRIPTION_LENGTH
      ) {
        return { error: `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.` };
      }
      value.description = body.description;
    }
  }
  if (!forUpdate || body.starts_at !== undefined) {
    if (typeof body.starts_at !== 'string' || Number.isNaN(Date.parse(body.starts_at))) {
      return { error: 'starts_at must be a valid date-time.' };
    }
    // Past dates are allowed: the schema keeps history, the booking rules
    // (not creation) reject booking past events.
    value.startsAt = new Date(body.starts_at).toISOString();
  }
  if (!forUpdate || body.total_seats !== undefined) {
    if (!Number.isInteger(body.total_seats) || (body.total_seats as number) <= 0) {
      return { error: 'total_seats must be a positive integer.' };
    }
    value.totalSeats = body.total_seats as number;
  }
  if (forUpdate && Object.keys(value).length === 0) {
    return { error: 'Provide at least one field to update.' };
  }
  return { value };
}

export function parsePagination(query: { page?: unknown; limit?: unknown }): {
  error?: string;
  page?: number;
  limit?: number;
} {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 10 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1) {
    return { error: 'page must be a positive integer.' };
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    return { error: `limit must be an integer between 1 and ${MAX_LIST_LIMIT}.` };
  }
  return { page, limit };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// Express 5 types route params as string | string[]; routes only use the
// single-segment form, anything else is treated as an invalid id.
export function paramId(value: string | string[]): string {
  return typeof value === 'string' ? value : '';
}
