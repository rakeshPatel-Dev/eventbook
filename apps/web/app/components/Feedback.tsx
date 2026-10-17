'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="mt-6 flex flex-col items-center rounded-4xl border border-line bg-card px-6 py-10 text-center"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-bg text-danger">
        <AlertTriangle size={24} />
      </span>
      <h3 className="mt-3 font-display font-bold tracking-tight">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-medium text-ink transition-colors hover:bg-primary-hover"
        >
          <RotateCcw size={15} /> {retryLabel}
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="mt-6 flex flex-col items-center rounded-4xl border border-dashed border-line bg-card/60 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-paper text-faint">
        {icon}
      </span>
      <h3 className="mt-3 font-display font-bold tracking-tight">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-4xl border border-line bg-card" aria-hidden="true">
      <div className="flex items-start gap-4 p-5 sm:p-6">
        <div className="w-[68px] shrink-0">
          <div className="skeleton h-2.5 w-8 rounded" />
          <div className="skeleton mt-2 h-10 w-12 rounded-md" />
          <div className="skeleton mt-2 h-2.5 w-10 rounded" />
        </div>
        <div aria-hidden="true" className="w-px self-stretch bg-line" />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-0.5">
          <div className="skeleton h-[26px] w-28 rounded-full" />
          <div className="skeleton h-3 w-24 rounded" />
        </div>
      </div>
      <div aria-hidden="true" className="ticket-edge mx-5 sm:mx-6" />
      <div className="p-5 sm:p-6">
        <div className="skeleton h-5 w-4/5 rounded" />
        <div className="skeleton mt-2 h-3.5 w-full rounded" />
        <div className="skeleton mt-1.5 h-3.5 w-2/3 rounded" />
        <div className="skeleton mt-4 h-1.5 w-full rounded-full" />
        <div className="mt-3 flex items-center gap-3">
          <div className="skeleton h-3.5 min-w-0 flex-1 rounded" />
          <div className="skeleton h-3 w-[136px] shrink-0 rounded" />
        </div>
        <div className="skeleton mt-3 h-[44px] w-32 rounded-full" />
      </div>
    </div>
  );
}

export function CardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-5 pt-6 md:grid-cols-2 lg:grid-cols-3"
      aria-label="Loading events"
    >
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
