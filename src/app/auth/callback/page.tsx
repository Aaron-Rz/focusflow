'use client';

/**
 * OAuth callback. With the PKCE flow and `detectSessionInUrl`, the supabase-js
 * client exchanges the `?code=` for a session automatically on load. We just
 * wait for the session to appear, then route into the app (or back to login on
 * failure).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // detectSessionInUrl runs asynchronously; onAuthStateChange fires once the
    // code exchange completes. Also check immediately in case it's already done.
    const finish = (ok: boolean) => {
      if (ok) router.replace('/');
      else setFailed(true);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => { if (session) finish(true); },
    );

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish(true);
    });

    // Fallback: if no session materialises, surface an error.
    const timeout = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      finish(!!data.session);
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      background: 'var(--bg)', color: 'var(--t2)', fontSize: 14, padding: 24,
    }}>
      {failed ? (
        <>
          <span style={{ color: 'var(--error)' }}>Sign-in failed.</span>
          <button
            onClick={() => router.replace('/auth/login')}
            style={{
              padding: '8px 16px', borderRadius: 'var(--r)', background: 'var(--accent)',
              color: 'var(--accent-text)', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >
            Back to sign in
          </button>
        </>
      ) : (
        'Signing you in…'
      )}
    </div>
  );
}
