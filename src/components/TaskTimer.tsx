'use client';

import { useEffect, useState } from 'react';
import { useTimerStore } from '@/stores/timerStore';
import { elapsedMs, formatElapsed, isRunning } from '@/lib/timer/timerSession';

interface TaskTimerProps {
  taskId: string;
  isDone: boolean;
}

export function TaskTimer({ taskId, isDone }: TaskTimerProps) {
  const { sessions, loadSessions, startTimer, pauseTimer, stopTimer, activeSession, sessionsForTask } =
    useTimerStore();
  const [, setTick] = useState(0);

  // Load sessions once on mount
  useEffect(() => {
    if (sessions.length === 0) loadSessions();
  }, [loadSessions, sessions.length]);

  // Tick every second while there's a running session for this task
  useEffect(() => {
    const active = activeSession(taskId);
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeSession, taskId, sessions]); // re-subscribe when sessions change

  // Auto-stop when task is marked done
  useEffect(() => {
    if (isDone) {
      stopTimer(taskId);
    }
  }, [isDone, taskId, stopTimer]);

  const active = activeSession(taskId);
  const allSessions = sessionsForTask(taskId);
  const now = new Date();

  // Total elapsed = sum of all sessions
  const totalMs = allSessions.reduce((sum, s) => sum + elapsedMs(s, now), 0);
  const running = !!active && isRunning(active);

  if (isDone) {
    if (totalMs === 0) return null;
    return (
      <span className="text-xs text-gray-400">⏱ {formatElapsed(totalMs)}</span>
    );
  }

  return (
    <div className="flex items-center gap-1 mt-1">
      <button
        onClick={() => (running ? pauseTimer(taskId) : startTimer(taskId))}
        className={`text-xs px-1.5 py-0.5 rounded border ${
          running
            ? 'border-orange-300 bg-orange-50 text-orange-700'
            : 'border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100'
        }`}
      >
        {running ? '⏸ Pause' : '▶ Start'}
      </button>
      {totalMs > 0 && (
        <span className={`text-xs tabular-nums ${running ? 'text-orange-600' : 'text-gray-500'}`}>
          {formatElapsed(totalMs)}
        </span>
      )}
    </div>
  );
}
