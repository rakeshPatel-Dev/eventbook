'use client';

import { Search } from 'lucide-react';
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
      <main className="mx-auto max-w-5xl px-4">
        <section className="pb-8 pt-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Curated local gatherings
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Find your next experience.</h1>
          <p className="mt-2 max-w-xl text-muted">
            Workshops, meetups, and live sessions — with live seat availability.
          </p>
          <div className="mt-6 flex items-center rounded-xl bg-card p-2 shadow-md">
            <Search size={20} className="ml-3 shrink-0 text-faint" />
            <input
              type="search"
              aria-label="Search events by title"
              placeholder="Search events by title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent px-3 py-2 text-ink outline-none placeholder:text-faint"
            />
          </div>
        </section>

        <div className="space-y-10 pb-16">
          <EventSection
            title="Upcoming events"
            pastOnly={false}
            search={committedSearch}
            emptyHint={
              committedSearch
                ? `Nothing matches “${committedSearch}”. Try a different title.`
                : 'No upcoming events yet. Check back soon.'
            }
          />
          <EventSection
            title="Previous events"
            pastOnly={true}
            search={committedSearch}
            emptyHint="No past events yet."
          />
        </div>
      </main>
    </div>
  );
}
