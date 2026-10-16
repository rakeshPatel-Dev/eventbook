'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type ApiUser } from '../lib/api';

export default function Home() {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status, data } = await api<{ user: ApiUser }>('/api/auth/me');
      setUser(status === 200 ? data.user : null);
    } catch {
      setError('Could not reach the API. Is the backend running?');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">EventBook</h1>
        <div className="mt-2 space-x-4 text-sm">
          <Link href="/events" className="underline">
            Browse events
          </Link>
          <Link href="/bookings" className="underline">
            My bookings
          </Link>
        </div>
        {loading ? (
          <p className="mt-2 text-sm text-zinc-600">Checking session…</p>
        ) : error ? (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        ) : user ? (
          <div className="mt-4">
            <p className="text-sm text-zinc-700">
              Logged in as <span className="font-medium">{user.email}</span> ({user.role}).
            </p>
            <button
              onClick={logout}
              className="mt-4 rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-800"
            >
              Log out
            </button>
          </div>
        ) : (
          <div className="mt-4 space-x-4 text-sm">
            <Link href="/login" className="underline">
              Log in
            </Link>
            <Link href="/register" className="underline">
              Register
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
