// Pure helpers for TimerSession. No I/O; `now` injected → testable.
import type { TimerSession } from '@/types';

/** True if the session is currently running (started but not ended). */
export function isRunning(session: TimerSession): boolean {
  return !session.endedAt;
}

/**
 * Total elapsed milliseconds for a session.
 * If running, elapsed = (now - startedAt) - pausedMs.
 * If ended,   elapsed = (endedAt - startedAt) - pausedMs.
 */
export function elapsedMs(session: TimerSession, now: Date): number {
  const start = new Date(session.startedAt).getTime();
  const end = session.endedAt ? new Date(session.endedAt).getTime() : now.getTime();
  return Math.max(0, end - start - session.pausedMs);
}

/** Format elapsed milliseconds as mm:ss or h:mm:ss. */
export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
