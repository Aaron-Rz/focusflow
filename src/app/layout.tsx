import type { Metadata, Viewport } from 'next';
import { Syne, Inconsolata } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Nav } from '@/components/Nav';
import { BackupReminderBanner } from '@/components/BackupReminderBanner';

const syne = Syne({
  subsets: ['latin'],
  variable: '--ff-syne',
  weight: ['400', '600', '700', '800'],
  display: 'swap',
});

const inconsolata = Inconsolata({
  subsets: ['latin'],
  variable: '--ff-inconsolata',
  weight: ['300', '400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FocusFlow',
  description: 'Personal task prioritization and time management',
  manifest: '/manifest.json',
  icons: { apple: '/icons/icon-192.png' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#0d0d0d',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${syne.variable} ${inconsolata.variable}`}
    >
      <head>
        {/* Set theme before paint to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('ff-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <BackupReminderBanner />
          <Nav />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
