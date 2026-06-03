'use client';

import { useTheme } from './ThemeProvider';

export function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: 'var(--r)',
        border: '1px solid var(--border-2)',
        background: 'var(--bg-2)',
        color: 'var(--accent)',
        cursor: 'pointer',
        fontSize: 16,
        flexShrink: 0,
      }}
    >
      {theme === 'dark' ? '☀︎' : '☾'}
    </button>
  );
}
