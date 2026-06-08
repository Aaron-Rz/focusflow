'use client';

/**
 * SyncInit — mounts once in the root layout.
 * Subscribes to Supabase auth state changes and triggers a full sync on sign-in.
 */

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useSyncStore } from '@/stores/syncStore';
import { syncAll } from '@/lib/sync/supabase-sync';

export function SyncInit() {
  useEffect(() => {
    const supabase = createClient();

    // Check existing session on mount
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        const { user } = data.session;
        useSyncStore.getState().setUser(user.id, user.email ?? null);
        syncAll(user.id);
      }
    });

    // Listen for future auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          const { user } = session;
          useSyncStore.getState().setUser(user.id, user.email ?? null);
          syncAll(user.id);
        } else {
          useSyncStore.getState().setUser(null, null);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
