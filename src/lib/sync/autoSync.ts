/**
 * Automatic background sync triggers:
 *   - visibilitychange → sync on app foreground
 *   - online           → sync on network reconnect
 *   - setInterval      → sync every 5 minutes while visible
 *
 * All paths guard against concurrent runs via the `running` flag.
 * `triggerSync` is a no-op when not logged in (userId absent).
 */

import { syncAll } from './supabase-sync';
import { useSyncStore } from '@/stores/syncStore';

const INTERVAL_MS = 5 * 60 * 1000;

let running = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let initialized = false;

export async function triggerSync(): Promise<void> {
  if (running) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  const { userId } = useSyncStore.getState();
  if (!userId) return;

  running = true;
  try {
    await syncAll(userId);
  } finally {
    running = false;
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') triggerSync();
}

function onOnline() {
  triggerSync();
}

export function initAutoSync(): () => void {
  if (initialized) return cleanupAutoSync;
  initialized = true;

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('online', onOnline);
  intervalId = setInterval(() => {
    if (document.visibilityState === 'visible') triggerSync();
  }, INTERVAL_MS);

  return cleanupAutoSync;
}

export function cleanupAutoSync(): void {
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('online', onOnline);
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  initialized = false;
}
