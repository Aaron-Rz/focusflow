'use client';

/**
 * AppFrame — decides the chrome around a page.
 *  - On `/auth/*` pages: render the bare page (no nav, no banners).
 *  - Everywhere else: the full app shell (nav, backup reminder, sync status).
 * Route protection itself lives in AuthGuard, which wraps this.
 */

import { usePathname } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { BackupReminderBanner } from '@/components/BackupReminderBanner';
import { SyncStatusBar } from '@/components/SyncStatusBar';

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith('/auth') ?? false;

  if (isAuthPage) return <>{children}</>;

  return (
    <>
      <BackupReminderBanner />
      <Nav />
      {children}
      <SyncStatusBar />
    </>
  );
}
