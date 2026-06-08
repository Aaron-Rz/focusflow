import { create } from 'zustand';
import { db } from '@/lib/db/dexie';
import type { TimerSession } from '@/types';
import { isRunning } from '@/lib/timer/timerSession';
import { v4 as uuidv4 } from 'uuid';
import { syncUpsertTimerSession } from '@/lib/sync/supabase-sync';

interface TimerStore {
  sessions: TimerSession[];
  loadSessions: () => Promise<void>;
  startTimer: (taskId: string) => Promise<void>;
  pauseTimer: (taskId: string) => Promise<void>;
  stopTimer: (taskId: string) => Promise<void>;
  activeSession: (taskId: string) => TimerSession | undefined;
  sessionsForTask: (taskId: string) => TimerSession[];
}

export const useTimerStore = create<TimerStore>((set, get) => ({
  sessions: [],

  loadSessions: async () => {
    const sessions = await db.timerSessions.toArray();
    set({ sessions });
  },

  startTimer: async (taskId) => {
    const existing = get().sessions.find(
      (s) => s.taskId === taskId && isRunning(s),
    );
    if (existing) return;

    const now = new Date().toISOString();
    const session: TimerSession = {
      id: uuidv4(), taskId, startedAt: now, pausedMs: 0, updatedAt: now,
    };
    await db.timerSessions.add(session);
    syncUpsertTimerSession(session);
    await get().loadSessions();
  },

  pauseTimer: async (taskId) => {
    const running = get().sessions.find(
      (s) => s.taskId === taskId && isRunning(s),
    );
    if (!running) return;
    const now = new Date().toISOString();
    await db.timerSessions.update(running.id, { endedAt: now, updatedAt: now });
    const updated = await db.timerSessions.get(running.id);
    if (updated) syncUpsertTimerSession(updated);
    await get().loadSessions();
  },

  stopTimer: async (taskId) => {
    const running = get().sessions.find(
      (s) => s.taskId === taskId && isRunning(s),
    );
    if (!running) return;
    const now = new Date().toISOString();
    await db.timerSessions.update(running.id, { endedAt: now, updatedAt: now });
    const updated = await db.timerSessions.get(running.id);
    if (updated) syncUpsertTimerSession(updated);
    await get().loadSessions();
  },

  activeSession: (taskId) =>
    get().sessions.find((s) => s.taskId === taskId && isRunning(s)),

  sessionsForTask: (taskId) =>
    get().sessions.filter((s) => s.taskId === taskId),
}));
