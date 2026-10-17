const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface ApiUser {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEvent {
  id: string;
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  totalSeats: number;
  seatsLeft: number;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiBooking {
  id: string;
  eventId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  event?: {
    id: string;
    title: string;
    startsAt: string;
    venue: string;
  };
}

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    ...init,
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

export function apiErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') {
    return (data as { error: string }).error;
  }
  return fallback;
}

// User-friendly error messages keyed by HTTP status code.
// Each status maps to a specific, actionable message for the frontend.
export const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: 'Invalid request. Please check your input and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  409: 'This action conflicts with the current state. Please refresh and try again.',
  422: 'Invalid data provided. Please check your input.',
  429: 'Too many attempts. Please wait a moment and try again.',
  500: 'Something went wrong on our end. Please try again later.',
  502: 'The server is temporarily unavailable. Please try again later.',
  503: 'The service is temporarily unavailable. Please try again later.',
};

// Returns a user-friendly message for any HTTP error response.
// Uses the backend error message if available, otherwise falls back to
// a status-specific generic message.
export function friendlyErrorMessage(status: number, data: unknown, fallback: string): string {
  const backendMsg = apiErrorMessage(data, '');
  if (backendMsg) return backendMsg;
  return HTTP_ERROR_MESSAGES[status] ?? fallback;
}
