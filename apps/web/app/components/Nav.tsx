'use client';

import { CalendarSearch, LogOut, Ticket } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, type ApiUser } from '../../lib/api';

// Display-only session state; every protected action is re-checked by the API.
export default function Nav() {
  const pathname = usePathname();
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
  }, [pathname, loadMe]);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }

  const link = (href: string, label: string) =>
    pathname === href ? (
      <span key={href} className="font-semibold text-ink">
        {label}
      </span>
    ) : (
      <Link key={href} href={href} className="text-muted transition-colors hover:text-ink">
        {label}
      </Link>
    );

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/events" className="text-lg font-bold tracking-tight">
            EventBook
          </Link>
          <nav className="hidden items-center gap-5 text-sm sm:flex">
            {link('/events', 'Explore')}
            {link('/bookings', 'My Bookings')}
            {user?.role === 'admin' && link('/admin', 'Admin')}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="hidden max-w-[180px] truncate text-muted sm:inline">
                {user.email}
              </span>
              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 font-medium transition-colors hover:bg-card"
              >
                <LogOut size={15} /> Log out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-2 py-1.5 text-muted transition-colors hover:text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-primary px-4 py-2 font-medium text-white transition-colors hover:bg-primary-hover"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
      <nav className="flex items-center gap-5 border-t border-line px-4 py-2 text-sm sm:hidden">
        <Link href="/events" className="inline-flex items-center gap-1.5 text-muted">
          <CalendarSearch size={15} /> Explore
        </Link>
        <Link href="/bookings" className="inline-flex items-center gap-1.5 text-muted">
          <Ticket size={15} /> My Bookings
        </Link>
        {user?.role === 'admin' && (
          <Link href="/admin" className="text-muted">
            Admin
          </Link>
        )}
      </nav>
    </header>
  );
}
