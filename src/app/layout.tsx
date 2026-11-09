import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { UpdateBanner } from '@/components/UpdateBanner';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

// Runs before paint so the saved theme applies without a flash.
const themeScript = `(function(){try{var p=localStorage.getItem('apex_theme')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';r.dataset.themePref=p;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',d?'#0b0b0f':'#f4f4f7');}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export const metadata: Metadata = {
  title: 'Apex Planner',
  description:
    'Next-generation personal operating system integrating calendar timelines, natural language task scheduling, and weekly review analytics.',
  applicationName: 'Apex Planner',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Apex Planner',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: '/apple-touch-icon.png',
    icon: '/icon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0b0f',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="h-full bg-bg text-fg antialiased">
        <Providers>
          <ServiceWorkerRegistrar />
          <UpdateBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
