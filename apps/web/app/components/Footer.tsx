import Image from 'next/image';
import Link from 'next/link';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-card">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/events" className="flex items-center gap-2" aria-label="EventBook home">
          <Image src="/logo.png" alt="EventBook logo" width={22} height={22} className="rounded" />
          <span className="font-display font-bold tracking-tight text-ink">EventBook</span>
          <span className="text-faint">·</span>
          <span className="text-xs">© {year} Find your next experience.</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm" aria-label="Footer">
          <Link href="/events" className="transition-colors hover:text-ink">
            Explore
          </Link>
          <Link href="/bookings" className="transition-colors hover:text-ink">
            My Bookings
          </Link>
        </nav>
      </div>
    </footer>
  );
}
