import { redirect } from 'next/navigation';

// The explore page is the landing page; a second discovery route would be clutter.
export default function Home() {
  redirect('/events');
}
