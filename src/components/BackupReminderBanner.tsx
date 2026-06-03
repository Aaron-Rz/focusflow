'use client';

import { useEffect, useState } from 'react';
import { exportToJSON } from '@/lib/db/backup';

const STORAGE_KEY = 'focusflow_last_backup_prompt';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function BackupReminderBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const last = localStorage.getItem(STORAGE_KEY);
    const lastMs = last ? parseInt(last, 10) : 0;
    if (Date.now() - lastMs >= ONE_WEEK_MS) {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setVisible(false);
  }

  async function handleExport() {
    const json = await exportToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focusflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3 text-sm">
      <span className="flex-1 text-amber-800">
        iOS may clear local data for unused PWAs — back up your tasks weekly.
      </span>
      <button
        onClick={handleExport}
        className="bg-amber-600 text-white rounded px-3 py-1 text-xs hover:bg-amber-700"
      >
        Export backup
      </button>
      <button
        onClick={dismiss}
        className="text-amber-500 hover:text-amber-700 text-xs underline"
      >
        Dismiss
      </button>
    </div>
  );
}
