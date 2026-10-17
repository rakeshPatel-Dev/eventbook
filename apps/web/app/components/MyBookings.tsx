'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { api, type ApiBooking } from '../../lib/api';

interface MyBookingsValue {
  /** Event ids where the viewer holds a confirmed booking. */
  confirmedIds: Set<string>;
  loading: boolean;
  refresh: () => Promise<void>;
}

const MyBookingsContext = createContext<MyBookingsValue>({
  confirmedIds: new Set(),
  loading: false,
  refresh: async () => {},
});

export function useMyBookings(): MyBookingsValue {
  return useContext(MyBookingsContext);
}

export function MyBookingsProvider({ children }: { children: ReactNode }) {
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // Login/logout happen via client-side navigation (layout stays mounted),
  // so re-sync on every route change — otherwise highlights stay empty
  // after signing in until a full page reload.
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    try {
      const { status, data } = await api<{ bookings: ApiBooking[] }>('/api/bookings/mine');
      if (status === 200 && data) {
        setConfirmedIds(
          new Set(
            data.bookings
              .filter((b) => b.status === 'confirmed')
              .map((b) => b.eventId ?? b.event?.id ?? '')
              .filter(Boolean),
          ),
        );
      } else {
        // 401 (logged out) or any failure: no highlights, never an error.
        setConfirmedIds(new Set());
      }
    } catch {
      setConfirmedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Skip fetch on pages that don't need booking data — avoids a guaranteed
    // 401 on unauthenticated pages and reduces unnecessary round-trips.
    const skipPaths = ['/login', '/register', '/admin'];
    if (skipPaths.some((p) => pathname.startsWith(p))) {
      return;
    }
    void refresh();
  }, [refresh, pathname]);

  const value = useMemo(
    () => ({ confirmedIds, loading, refresh }),
    [confirmedIds, loading, refresh],
  );

  return <MyBookingsContext.Provider value={value}>{children}</MyBookingsContext.Provider>;
}
