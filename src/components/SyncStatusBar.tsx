'use client';

/**
 * SyncStatusBar — non-blocking toast for sync errors / in-progress indicator.
 * Shows at the bottom of the screen above the nav, auto-dismisses errors after 6 s.
 */

import { useEffect, useRef } from 'react';
import { useSyncStore } from '@/stores/syncStore';

export function SyncStatusBar() {
  const { syncing, error, clearError, userId } = useSyncStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss error after 6 seconds
  useEffect(() => {
    if (error) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => clearError(), 6000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [error, clearError]);

  // Nothing to show if not logged in and no error
  if (!userId && !error) return null;
  if (!syncing && !error) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(var(--nav-h, 60px) + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        borderRadius: 'var(--r-md)',
        background: error ? 'var(--bg-1)' : 'var(--bg-1)',
        border: `1px solid ${error ? 'var(--error)' : 'var(--border-2)'}`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        fontSize: 12,
        color: error ? 'var(--error)' : 'var(--t2)',
        maxWidth: 'calc(100vw - 32px)',
        pointerEvents: error ? 'auto' : 'none',
      }}
    >
      {syncing && !error && (
        <>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--accent)',
              animation: 'pulse 1.2s ease-in-out infinite',
            }}
          />
          <span style={{ color: 'var(--t2)' }}>Syncing…</span>
        </>
      )}
      {error && (
        <>
          <span>⚠ {error}</span>
          <button
            onClick={clearError}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--error)',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              padding: '0 4px',
              marginLeft: 4,
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}
