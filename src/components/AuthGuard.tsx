'use client';

/**
 * AuthGuard — client-side route protection for the PWA.
 *
 * Session lives in localStorage (supabase-js), so there is no server cookie to
 * gate on; we guard on the client instead. Any route outside `/auth/*` requires
 * a session — otherwise we redirect to the login page. While the session state
 * is still unknown we render nothing to avoid a flash of protected content.
 */

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

const PUBLIC_PREFIX = '/auth';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);

  const isPublic = pathname?.startsWith(PUBLIC_PREFIX) ?? false;

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setAuthed(!!session),
    );
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authed === null) return;            // still resolving
    if (!authed && !isPublic) {
      router.replace('/auth/login');
    } else if (authed && isPublic) {
      router.replace('/');                   // already signed in → leave auth pages
    }
  }, [authed, isPublic, router]);

  // Public pages render immediately; protected pages wait until a session is confirmed.
  if (isPublic) return <>{children}</>;
  if (authed) return <>{children}</>;
  return null;
}
