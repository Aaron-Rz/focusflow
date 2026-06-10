'use client';

/**
 * SyncInit — mounts once in the root layout.
 * Subscribes to Supabase auth state changes and triggers a full sync on sign-in.
 */

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useSyncStore } from '@/stores/syncStore';
import { syncAll, loadUsername } from '@/lib/sync/supabase-sync';
import { initAutoSync, cleanupAutoSync } from '@/lib/sync/autoSync';

export function SyncInit() {
  // Auth state + initial sync
  useEffect(() => {
    const supabase = createClient();

    const onSignedIn = (user: { id: string; email?: string }) => {
      useSyncStore.getState().setUser(user.id, user.email ?? null);
      syncAll(user.id).then(() => loadUsername());
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) onSignedIn(data.session.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          onSignedIn(session.user);
        } else {
          useSyncStore.getState().setUser(null, null);
          useSyncStore.getState().setUsername(null);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  // Auto-sync listeners (visibility, online, interval)
  useEffect(() => {
    initAutoSync();
    return cleanupAutoSync;
  }, []);

  return null;
}
