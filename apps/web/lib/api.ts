const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface ApiUser {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
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
