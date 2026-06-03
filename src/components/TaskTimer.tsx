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

  useEffect(() => {
    if (sessions.length === 0) loadSessions();
  }, [loadSessions, sessions.length]);

  useEffect(() => {
    const active = activeSession(taskId);
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeSession, taskId, sessions]);

  useEffect(() => {
    if (isDone) stopTimer(taskId);
  }, [isDone, taskId, stopTimer]);

  const active = activeSession(taskId);
  const allSessions = sessionsForTask(taskId);
  const now = new Date();
  const totalMs = allSessions.reduce((sum, s) => sum + elapsedMs(s, now), 0);
  const running = !!active && isRunning(active);

  if (isDone) {
    if (totalMs === 0) return null;
    return (
      <span style={{ color: 'var(--t3)', fontSize: 11 }}>
        ⏱ {formatElapsed(totalMs)}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <button
        onClick={() => (running ? pauseTimer(taskId) : startTimer(taskId))}
        style={{
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 'var(--r)',
          border: '1px solid',
          borderColor: running ? 'var(--warn)' : 'var(--border-2)',
          background: running ? 'var(--accent-dim)' : 'transparent',
          color: running ? 'var(--warn)' : 'var(--t2)',
          cursor: 'pointer',
          minHeight: 24,
          letterSpacing: '0.03em',
        }}
      >
        {running ? '⏸ pause' : '▶ start'}
      </button>
      {totalMs > 0 && (
        <span
          className="tabular-nums"
          style={{
            fontSize: 11,
            color: running ? 'var(--accent)' : 'var(--t3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatElapsed(totalMs)}
        </span>
      )}
    </div>
  );
}
