'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import Nav from '../components/Nav';
import { EventSection } from './EventSection';

export default function EventsPage() {
  const [search, setSearch] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setCommittedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="page-rise pb-8 pt-10 sm:pt-14">
          <p className="text-sm font-medium text-muted">Workshops, meetups, and live sessions</p>
          <h1 className="mt-2 max-w-3xl font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl">
            Find your next experience.
          </h1>
          <p className="mt-3 max-w-xl leading-relaxed text-muted">
            Every seat count is live. Book in one tap, cancel anytime before showtime.
          </p>
          <div className="mt-6 flex max-w-2xl items-center gap-2 rounded-full border border-line bg-card p-2 pl-2 shadow-[0_8px_30px_rgba(22,19,14,0.06)] focus-within:border-ink/40">
            <Search size={19} className="ml-3 shrink-0 text-faint" />
            <input
              type="search"
              aria-label="Search events by title"
              placeholder="Search events by title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent px-1 py-2.5 text-[16px] text-ink outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
            />
            {search ? (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="mr-1 rounded-full p-2.5 text-faint transition-colors hover:bg-paper hover:text-ink"
              >
                <X size={16} />
              </button>
            ) : (
              <span className="mr-3 hidden shrink-0 rounded-md border border-line bg-paper px-2 py-1 text-xs text-faint sm:inline">
                Type to filter
              </span>
            )}
          </div>
          {committedSearch && (
            <p className="mt-3 text-sm text-muted">
              Showing results for{' '}
              <span className="font-semibold text-ink">“{committedSearch}”</span>{' '}
              <button
                onClick={() => setSearch('')}
                className="ml-1 font-medium text-primary-deep hover:underline"
              >
                Clear
              </button>
            </p>
          )}
        </section>

        <div className="space-y-12 pb-16">
          <EventSection
            title="Upcoming"
            search={committedSearch}
            emptyHint={
              committedSearch
                ? `Nothing matches “${committedSearch}”. Try a different title.`
                : 'No upcoming events yet. Check back soon.'
            }
          />
        </div>
      </main>
    </div>
  );
}
