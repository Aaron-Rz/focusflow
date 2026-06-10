'use client';

import { useEffect, useState } from 'react';
import { exportToJSON } from '@/lib/db/backup';
import { downloadFile } from '@/lib/utils/download';

const STORAGE_KEY = 'focusflow_last_backup_prompt';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function BackupReminderBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const last   = localStorage.getItem(STORAGE_KEY);
      const lastMs = last ? parseInt(last, 10) : 0;
      if (Date.now() - lastMs >= ONE_WEEK_MS) setVisible(true);
    } catch {}
  }, []);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
    setVisible(false);
  }

  async function handleExport() {
    const json = await exportToJSON();
    downloadFile(json, `focusflow-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    dismiss();
  }

  if (!visible) return null;

  return (
    <div
      style={{
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--warn)',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 12,
      }}
    >
      <span style={{ flex: 1, color: 'var(--t1)', lineHeight: 1.4 }}>
        <span style={{ color: 'var(--warn)', fontWeight: 600, marginRight: 4 }}>⚠</span>
        iOS may clear local data — back up weekly.
      </span>
      <button
        onClick={handleExport}
        style={{
          fontSize: 11,
          padding: '4px 10px',
          borderRadius: 'var(--r)',
          background: 'var(--warn)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontWeight: 600,
          minHeight: 44,
          minWidth: 44,
          flexShrink: 0,
          touchAction: 'manipulation',
        }}
      >
        Export
      </button>
      <button
        onClick={dismiss}
        style={{
          fontSize: 11,
          color: 'var(--t3)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textDecoration: 'underline',
          padding: '0 8px',
          minHeight: 44,
          minWidth: 44,
          flexShrink: 0,
          touchAction: 'manipulation',
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
