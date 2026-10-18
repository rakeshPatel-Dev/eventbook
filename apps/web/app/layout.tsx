import type { Metadata } from 'next';
import { Geist, Space_Grotesk } from 'next/font/google';
import Footer from './components/Footer';
import { MyBookingsProvider } from './components/MyBookings';
import { ToastProvider } from './components/Toast';
import './globals.css';

const geist = Geist({ subsets: ['latin'] });
const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-display' });

export const metadata: Metadata = {
  title: 'EventBook — Find your next experience',
  description: 'Workshops, meetups, and live sessions with live seat availability.',
  appleWebApp: {
    title: 'Eventbook',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="dcbedaa5-5243-47e1-86be-10163fba56ee"
        />
      </head>
      <body className={`${geist.className} ${display.variable} antialiased`}>
        <ToastProvider>
          <MyBookingsProvider>{children}</MyBookingsProvider>
        </ToastProvider>
        <Footer />
      </body>
    </html>
  );
}
