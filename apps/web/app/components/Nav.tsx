'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, type ApiUser } from '../../lib/api';

// Shared top navigation with session state. Auth is display-only here;
// every protected action is re-checked by the backend.
export default function Nav() {
  const [user, setUser] = useState<ApiUser | null>(null);

  const loadMe = useCallback(async () => {
    try {
      const { status, data } = await api<{ user: ApiUser }>('/api/auth/me');
      setUser(status === 200 && data ? data.user : null);
    } catch {
      setUser(null);
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
    <nav className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
      <div className="space-x-4 text-sm">
        <Link href="/" className="font-semibold text-zinc-900">
          EventBook
        </Link>
        <Link href="/events" className="text-zinc-600 underline">
          Events
        </Link>
        <Link href="/bookings" className="text-zinc-600 underline">
          My bookings
        </Link>
        {user?.role === 'admin' && (
          <Link href="/admin" className="text-zinc-600 underline">
            Admin
          </Link>
        )}
      </div>
      <div className="text-sm">
        {user ? (
          <span className="space-x-3 text-zinc-600">
            <span>{user.email}</span>
            <button onClick={logout} className="underline">
              Log out
            </button>
          </span>
        ) : (
          <span className="space-x-3">
            <Link href="/login" className="text-zinc-600 underline">
              Log in
            </Link>
            <Link href="/register" className="text-zinc-600 underline">
              Register
            </Link>
          </span>
        )}
      </div>
    </nav>
  );
}
