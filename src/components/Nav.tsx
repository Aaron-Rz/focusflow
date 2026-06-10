'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';
import { useSyncStore } from '@/stores/syncStore';

const NAV_ITEMS = [
  { href: '/',            label: 'Tasks',      icon: '◈' },
  { href: '/workblocks',  label: 'Workblocks', icon: '▦' },
  { href: '/habits',      label: 'Habits',     icon: '○' },
  { href: '/analytics',   label: 'Analytics',  icon: '◎' },
  { href: '/settings',    label: 'Settings',   icon: '⚙' },
];

function SyncDot() {
  const { syncStatus, userId } = useSyncStore();
  if (!userId) return null;
  if (syncStatus === 'syncing') {
    return (
      <span
        className="ff-spin"
        style={{
          position: 'absolute', top: 4, right: 4,
          width: 6, height: 6, borderRadius: '50%',
          border: '1.5px solid var(--accent)',
          borderTopColor: 'transparent',
          display: 'block',
        }}
      />
    );
  }
  if (syncStatus === 'error') {
    return (
      <span
        style={{
          position: 'absolute', top: 4, right: 4,
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--warn)',
          display: 'block',
        }}
      />
    );
  }
  return null;
}

export function Nav() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { syncStatus, userId } = useSyncStore();

  const themeIcon = theme === 'dark' ? '☀︎' : '☾';
  const themeLabel = theme === 'dark' ? 'Light mode' : 'Dark mode';

  return (
    <>
      {/* ── Bottom nav — mobile ── */}
      <nav
        aria-label="Main navigation"
        style={{
          background: 'var(--bg-1)',
          borderTop: '1px solid var(--border)',
          height: 'var(--nav-h)',
        }}
        className="fixed bottom-0 left-0 right-0 flex items-stretch z-50 md:hidden"
      >
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const active = pathname === href;
          const isSettings = href === '/settings';
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px]"
              style={{
                color: active ? 'var(--accent)' : 'var(--t2)',
                fontFamily: 'var(--ff-dm-sans, sans-serif)',
                textDecoration: 'none',
                position: 'relative',
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
              <span style={{ fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {label}
              </span>
              {isSettings && <SyncDot />}
            </Link>
          );
        })}
        <button
          onClick={toggleTheme}
          title={themeLabel}
          aria-label={themeLabel}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px]"
          style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>{themeIcon}</span>
          <span style={{ fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </span>
        </button>
      </nav>

      {/* ── Sidebar — desktop ── */}
      <nav
        aria-label="Main navigation"
        style={{
          width: 'var(--sidebar-w)',
          background: 'var(--bg-1)',
          borderRight: '1px solid var(--border)',
        }}
        className="hidden md:flex fixed left-0 top-0 bottom-0 flex-col items-center py-4 z-50"
      >
        <div
          style={{
            fontFamily: 'var(--ff-dm-sans, sans-serif)',
            fontWeight: 800,
            fontSize: 16,
            color: 'var(--accent)',
            marginBottom: 24,
            letterSpacing: '-0.02em',
          }}
        >
          FF
        </div>
        <div className="flex flex-col items-center gap-1 flex-1">
          {NAV_ITEMS.map(({ href, label, icon }) => {
            const active = pathname === href;
            const isSettings = href === '/settings';
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className="flex flex-col items-center justify-center rounded-[var(--r-md)] w-10 h-10"
                style={{
                  color: active ? 'var(--accent)' : 'var(--t2)',
                  background: active ? 'var(--accent-dim)' : 'transparent',
                  textDecoration: 'none',
                  fontSize: 18,
                  transition: 'color 150ms, background 150ms',
                  position: 'relative',
                }}
              >
                {icon}
                {isSettings && <SyncDot />}
              </Link>
            );
          })}
        </div>
        {/* Desktop sync status indicator */}
        {userId && syncStatus !== 'idle' && (
          <div
            style={{
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={syncStatus === 'error' ? 'Sync error — tap Settings' : 'Syncing…'}
          >
            {syncStatus === 'syncing' ? (
              <span
                className="ff-spin"
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  border: '1.5px solid var(--accent)',
                  borderTopColor: 'transparent',
                  display: 'block',
                }}
              />
            ) : (
              <span
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--warn)',
                  display: 'block',
                }}
              />
            )}
          </div>
        )}
        <button
          onClick={toggleTheme}
          title={themeLabel}
          aria-label={themeLabel}
          className="flex items-center justify-center rounded-[var(--r-md)] w-10 h-10"
          style={{
            color: 'var(--accent)',
            background: 'var(--accent-dim)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          {themeIcon}
        </button>
      </nav>
    </>
  );
}
