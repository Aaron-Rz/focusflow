'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useSyncStore } from '@/stores/syncStore';
import { clearLocalData, loadUsername } from '@/lib/sync/supabase-sync';
import { triggerSync } from '@/lib/sync/autoSync';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs === 1) return '1 hr ago';
  if (hrs < 24) return `${hrs} hrs ago`;
  return 'over a day ago';
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 0',
        borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--t2)' }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { userId, userEmail, username, syncing, syncStatus, lastSyncedAt, error } = useSyncStore();
  const [signingOut, setSigningOut] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      if (data.session) {
        useSyncStore.getState().setUser(
          data.session.user.id,
          data.session.user.email ?? null,
        );
        loadUsername();
      }
    });
  }, []);

  // Re-render every 30s so relative time ("2 min ago") stays current
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    // 1. End the Supabase session (clears the persisted session).
    await createClient().auth.signOut();
    // 2. Wipe ALL local data so the next person on this device can't see or
    //    accidentally upload the previous account's tasks/habits/etc.
    await clearLocalData();
    useSyncStore.getState().setUser(null, null);
    useSyncStore.getState().setUsername(null);
    // 3. Hard reload to reset all in-memory Zustand stores to empty.
    window.location.assign('/auth/login');
  };

  const handleManualSync = () => {
    if (userId) triggerSync();
  };

  const syncedLabel = (() => {
    if (syncStatus === 'syncing') return null;
    if (!lastSyncedAt) return 'never';
    return relativeTime(lastSyncedAt);
  })();

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
      {/* Header */}
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 40,
          background: 'var(--bg-1)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            maxWidth: 640, margin: '0 auto',
            padding: '10px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <h1
            style={{
              fontFamily: 'var(--ff-dm-sans, sans-serif)',
              fontWeight: 800, fontSize: 18,
              letterSpacing: '-0.02em', color: 'var(--t1)', lineHeight: 1,
            }}
          >
            Settings
          </h1>
          <ThemeToggleButton />
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 32px' }}>

        {/* ── Account ── */}
        <section style={{ marginBottom: 32 }}>
          <div
            style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--t2)', marginBottom: 4,
            }}
          >
            Account
          </div>
          <div
            style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              padding: '0 16px',
            }}
          >
            {userId ? (
              <>
                {username && (
                  <Row label="Username">
                    <span style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 600 }}>
                      {username}
                    </span>
                  </Row>
                )}
                <Row label="Signed in as">
                  <span style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 500 }}>
                    {userEmail ?? userId}
                  </span>
                </Row>
                <Row label="Cloud sync">
                  <span style={{ fontSize: 12, color: 'var(--ok)', fontWeight: 500 }}>
                    ● Active
                  </span>
                </Row>
                <div style={{ padding: '12px 0' }}>
                  <button
                    onClick={handleSignOut}
                    disabled={signingOut}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 'var(--r)',
                      border: '1px solid var(--error)',
                      background: 'transparent',
                      color: 'var(--error)',
                      cursor: signingOut ? 'default' : 'pointer',
                      opacity: signingOut ? 0.5 : 1,
                      fontSize: 13,
                      fontWeight: 600,
                      minHeight: 36,
                    }}
                  >
                    {signingOut ? 'Signing out…' : 'Sign out'}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: '16px 0' }}>
                <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 12 }}>
                  Sign in to sync your data across devices.
                </p>
                <button
                  onClick={() => router.push('/auth/login')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--r)',
                    background: 'var(--accent)',
                    color: 'var(--accent-text)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    minHeight: 36,
                  }}
                >
                  Sign in
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ── Sync status ── */}
        {userId && (
          <section style={{ marginBottom: 32 }}>
            <div
              style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--t2)', marginBottom: 4,
              }}
            >
              Sync
            </div>
            <div
              style={{
                background: 'var(--bg-1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                padding: '0 16px',
              }}
            >
              <Row label="Last synced">
                <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {syncStatus === 'syncing' && (
                    <span
                      className="ff-spin"
                      style={{
                        width: 10, height: 10, borderRadius: '50%',
                        border: '1.5px solid var(--accent)',
                        borderTopColor: 'transparent',
                        display: 'inline-block', flexShrink: 0,
                      }}
                    />
                  )}
                  <span style={{
                    color: syncStatus === 'syncing' ? 'var(--accent)'
                         : syncStatus === 'error'   ? 'var(--error)'
                         : 'var(--t1)',
                  }}>
                    {syncStatus === 'syncing' ? 'Syncing…'
                   : syncStatus === 'error'   ? 'Sync failed'
                   : syncedLabel}
                  </span>
                </span>
              </Row>
              {error && (
                <Row label="Error">
                  <span style={{ fontSize: 12, color: 'var(--error)', maxWidth: 220, textAlign: 'right' }}>
                    {error}
                  </span>
                </Row>
              )}
              <div style={{ padding: '12px 0' }}>
                <button
                  onClick={handleManualSync}
                  disabled={syncing}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--r)',
                    border: '1px solid var(--accent)',
                    background: 'transparent',
                    color: 'var(--accent)',
                    cursor: syncing ? 'default' : 'pointer',
                    opacity: syncing ? 0.5 : 1,
                    fontSize: 13,
                    fontWeight: 600,
                    minHeight: 44,
                    touchAction: 'manipulation',
                  }}
                >
                  {syncing ? 'Syncing…' : 'Sync now'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Appearance ── */}
        <section style={{ marginBottom: 32 }}>
          <div
            style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--t2)', marginBottom: 4,
            }}
          >
            Appearance
          </div>
          <div
            style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              padding: '0 16px',
            }}
          >
            <Row label="Theme">
              <ThemeToggleButton />
            </Row>
          </div>
        </section>

        {/* ── About ── */}
        <section>
          <div
            style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              padding: '0 16px',
            }}
          >
            <Row label="Version">
              <span style={{ fontSize: 13, color: 'var(--t3)' }}>v1.0</span>
            </Row>
            <Row label="Storage">
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>
                IndexedDB (local) {userId ? '+ Supabase (cloud)' : '— sign in for cloud backup'}
              </span>
            </Row>
          </div>
        </section>

      </main>
    </div>
  );
}
