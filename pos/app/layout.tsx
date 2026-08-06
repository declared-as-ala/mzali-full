import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';
import SessionBoundary from '@/components/SessionBoundary';
import { PROACTIVE_REFRESH_SECONDS } from '@/lib/session-duration';

export const metadata: Metadata = {
  title: 'Mzali POS',
  description: 'Caisse boutique Mzali',
  applicationName: 'Mzali POS',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mzali POS',
  },
  icons: {
    icon: [{ url: '/pwa-icon-192.png', type: 'image/png', sizes: '192x192' }],
    apple: [{ url: '/pwa-icon-192.png', type: 'image/png', sizes: '192x192' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0F172A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh select-none overscroll-none">
        <SessionBoundary proactiveSeconds={PROACTIVE_REFRESH_SECONDS} />
        {children}
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
