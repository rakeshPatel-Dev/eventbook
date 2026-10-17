'use client';

import { AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastKind = 'success' | 'error' | 'info' | 'loading';

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  desc?: string;
}

// Returned by loading(); resolves the in-flight toast into a final state.
interface ToastHandle {
  id: number;
  success: (title: string, desc?: string) => void;
  error: (title: string, desc?: string) => void;
  info: (title: string, desc?: string) => void;
  dismiss: () => void;
}

interface ToastContextValue {
  toast: (kind: ToastKind, title: string, desc?: string) => number;
  // Shows a sticky "working…" toast; call the returned handle when done.
  loading: (title: string, desc?: string) => ToastHandle;
  success: (title: string, desc?: string) => void;
  error: (title: string, desc?: string) => void;
  info: (title: string, desc?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>.');
  }
  return ctx;
}

const ICONS: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  loading: Loader2,
};

const ACCENT: Record<ToastKind, string> = {
  success: 'text-ok-ink',
  error: 'text-danger',
  info: 'text-primary-deep',
  loading: 'text-muted',
};

const AUTO_DISMISS_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // (Re)schedule auto-dismiss. Loading toasts are not scheduled: they stay
  // until the caller resolves them, so long waits never fade mid-flight.
  const schedule = useCallback(
    (id: number, ms: number) => {
      const existing = timers.current.get(id);
      if (existing) {
        window.clearTimeout(existing);
      }
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), ms),
      );
    },
    [dismiss],
  );

  const toast = useCallback(
    (kind: ToastKind, title: string, desc?: string): number => {
      idRef.current += 1;
      const id = idRef.current;
      setToasts((prev) => [...prev.slice(-3), { id, kind, title, desc }]);
      // Loading stays sticky; every other kind fades on its own.
      if (kind !== 'loading') {
        schedule(id, AUTO_DISMISS_MS);
      }
      return id;
    },
    [schedule],
  );

  const loading = useCallback(
    (title: string, desc?: string): ToastHandle => {
      const id = toast('loading', title, desc);
      const resolve =
        (kind: 'success' | 'error' | 'info') => (nextTitle: string, nextDesc?: string) => {
          dismiss(id);
          toast(kind, nextTitle, nextDesc);
        };
      return {
        id,
        success: resolve('success'),
        error: resolve('error'),
        info: resolve('info'),
        dismiss: () => dismiss(id),
      };
    },
    [toast, dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      loading,
      success: (title, desc) => toast('success', title, desc),
      error: (title, desc) => toast('error', title, desc),
      info: (title, desc) => toast('info', title, desc),
    }),
    [toast, loading],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-20 z-[100] flex w-[min(92vw,380px)] flex-col gap-2"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className="toast-in pointer-events-auto flex items-start gap-3 rounded-2xl border border-ink/15 bg-card p-3.5 shadow-[0_12px_40px_rgba(22,19,14,0.14)]"
            >
              <Icon
                size={18}
                className={`mt-0.5 shrink-0 ${ACCENT[t.kind]} ${
                  t.kind === 'loading' ? 'animate-spin' : ''
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug">{t.title}</p>
                {t.desc && <p className="mt-0.5 break-words text-sm text-muted">{t.desc}</p>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="rounded-md p-1 text-faint transition-colors hover:bg-paper hover:text-ink"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
