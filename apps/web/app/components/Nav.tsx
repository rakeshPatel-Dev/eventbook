'use client';

import { CalendarSearch, LogIn, LogOut, ShieldCheck, Ticket, UserPlus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, type ApiUser } from '../../lib/api';
import { useToast } from './Toast';

// Display-only session state; every protected action is re-checked by the API.
export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const { error: toastError, loading } = useToast();

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
    if (loggingOut) {
      return;
    }
    setLoggingOut(true);
    const t = loading('Signing out…');
    try {
      const { status } = await api('/api/auth/logout', { method: 'POST' });
      setUser(null);
      if (status === 200) {
        t.success('Signed out', 'See you next time.');
      } else {
        t.dismiss();
      }
      // Leave protected surfaces: /admin and /bookings render from state
      // loaded at mount and never re-check, so staying put would show
      // stale admin/bookings UI after the session is gone.
      router.push('/events');
      router.refresh();
    } catch {
      t.error('Sign-out failed', 'Check your connection and try again.');
    } finally {
      setLoggingOut(false);
    }
  }

  const initial = user?.email?.charAt(0).toUpperCase() ?? '';

  const link = (href: string, label: string, Icon: typeof CalendarSearch) =>
    pathname === href ? (
      <span
        key={href}
        aria-current="page"
        className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 font-semibold text-white"
      >
        <Icon size={15} aria-hidden="true" />
        {label}
      </span>
    ) : (
      <Link
        key={href}
        href={href}
        className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-muted transition-colors hover:bg-line/70 hover:text-ink"
      >
        <Icon size={15} aria-hidden="true" />
        {label}
      </Link>
    );

  return (
    <div className="sticky top-3 z-50 px-4">
      <header className="mx-auto max-w-6xl rounded-4xl border border-line bg-card/95 shadow-[0_8px_30px_rgba(22,19,14,0.08)] backdrop-blur-md">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-5">
            <Link
              href="/events"
              className="flex shrink-0 items-center gap-2.5"
              aria-label="EventBook home"
            >
              <Image
                src="/logo.png"
                alt="EventBook logo"
                width={30}
                height={30}
                priority
                className="rounded-md"
              />
              <span className="font-display text-lg font-bold tracking-tight">EventBook</span>
            </Link>
            <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Primary">
              {link('/events', 'Explore', CalendarSearch)}
              {link('/bookings', 'My Bookings', Ticket)}
              {user?.role === 'admin' && link('/admin', 'Admin', ShieldCheck)}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="hidden items-center gap-2 text-muted lg:inline-flex">
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs font-bold text-white"
                  >
                    {initial}
                  </span>
                  <span className="max-w-[180px] truncate">{user.email}</span>
                </span>
                <button
                  onClick={logout}
                  disabled={loggingOut}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-line bg-card px-4 py-1.5 font-medium transition-colors hover:bg-paper disabled:opacity-50"
                >
                  <LogOut size={15} /> {loggingOut ? 'Signing out…' : 'Log out'}
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden items-center gap-1.5 px-2 py-2 text-muted transition-colors hover:text-ink sm:inline-flex"
                >
                  <LogIn size={15} aria-hidden="true" /> Sign in
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 font-medium text-ink transition-colors hover:bg-primary-hover"
                >
                  <UserPlus size={15} aria-hidden="true" /> Create account
                </Link>
              </>
            )}
          </div>
        </div>
        <nav
          className="flex items-center gap-2 overflow-x-auto border-t border-dashed border-line px-4 py-2 text-sm md:hidden"
          aria-label="Primary mobile"
        >
          <Link
            href="/events"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted hover:bg-paper"
          >
            <CalendarSearch size={15} /> Explore
          </Link>
          <Link
            href="/bookings"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted hover:bg-paper"
          >
            <Ticket size={15} /> My Bookings
          </Link>
          {user?.role === 'admin' && (
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted hover:bg-paper"
            >
              <ShieldCheck size={15} aria-hidden="true" /> Admin
            </Link>
          )}
          {!user && (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted hover:bg-paper"
            >
              <LogIn size={15} aria-hidden="true" /> Sign in
            </Link>
          )}
        </nav>
      </header>
    </div>
  );
}
