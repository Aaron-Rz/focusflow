import { create } from 'zustand';
import { db } from '@/lib/db/dexie';
import type { TimerSession } from '@/types';
import { isRunning } from '@/lib/timer/timerSession';
import { v4 as uuidv4 } from 'uuid';

interface TimerStore {
  sessions: TimerSession[];
  loadSessions: () => Promise<void>;
  /** Start a new session for a task. If one is already running, does nothing. */
  startTimer: (taskId: string) => Promise<void>;
  /**
   * Pause the running session for a task.
   * Records the pause start time internally by snapshotting pausedMs.
   */
  pauseTimer: (taskId: string) => Promise<void>;
  /** Stop (end) the running session for a task. Called on task completion. */
  stopTimer: (taskId: string) => Promise<void>;
  /** Active session for a task, or undefined. */
  activeSession: (taskId: string) => TimerSession | undefined;
  /** All sessions for a task (including past). */
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
      (s) => s.taskId === taskId && isRunning(s)
    );
    if (existing) return; // already running

    // If there's a paused session (endedAt set but we track it), start fresh.
    const session: TimerSession = {
      id: uuidv4(),
      taskId,
      startedAt: new Date().toISOString(),
      pausedMs: 0,
    };
    await db.timerSessions.add(session);
    await get().loadSessions();
  },

  pauseTimer: async (taskId) => {
    const running = get().sessions.find(
      (s) => s.taskId === taskId && isRunning(s)
    );
    if (!running) return;
    // End the session; elapsed is already correct via wall-clock.
    // To "pause" we end the current session; resuming starts a new one.
    await db.timerSessions.update(running.id, {
      endedAt: new Date().toISOString(),
    });
    await get().loadSessions();
  },

  stopTimer: async (taskId) => {
    const running = get().sessions.find(
      (s) => s.taskId === taskId && isRunning(s)
    );
    if (!running) return;
    await db.timerSessions.update(running.id, {
      endedAt: new Date().toISOString(),
    });
    await get().loadSessions();
  },

  activeSession: (taskId) =>
    get().sessions.find((s) => s.taskId === taskId && isRunning(s)),

  sessionsForTask: (taskId) =>
    get().sessions.filter((s) => s.taskId === taskId),
}));
