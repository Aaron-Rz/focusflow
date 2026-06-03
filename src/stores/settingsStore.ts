'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Settings {
  pomodoroWorkMin: number;
  pomodoroBreakMin: number;
  setPomodoroWorkMin: (v: number) => void;
  setPomodoroBreakMin: (v: number) => void;
}

export const useSettingsStore = create<Settings>()(
  persist(
    (set) => ({
      pomodoroWorkMin: 25,
      pomodoroBreakMin: 5,
      setPomodoroWorkMin: (v) => set({ pomodoroWorkMin: v }),
      setPomodoroBreakMin: (v) => set({ pomodoroBreakMin: v }),
    }),
    { name: 'focusflow-settings' }
  )
);
