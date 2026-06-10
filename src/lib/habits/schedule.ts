/**
 * Pure scheduling helpers for the Habit data model.
 * No I/O — all inputs are injected so functions remain unit-testable.
 */

import type { Habit } from '@/types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Extract a local YYYY-MM-DD string from either a full ISO datetime or a bare date string.
 * Used so legacy YYYY-MM-DD entries and new full-datetime entries are treated identically
 * when checking "was this habit completed on day X?"
 */
export function completionDateStr(entry: string): string {
  if (entry.length === 10) return entry; // already YYYY-MM-DD
  const d = new Date(entry);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

// ─── isDueToday ────────────────────────────────────────────────────────────────

/**
 * Returns true if the habit is scheduled on the day represented by `now`.
 *
 * - daily:    always
 * - interval: daysSinceCreation % every === 0  (fixed cadence from createdAt)
 * - weekly:   now.getDay() is in weekdays
 * - monthly:  now.getDate() is in daysOfMonth
 */
export function isDueToday(habit: Habit, now: Date = new Date()): boolean {
  const f = habit.frequency;
  switch (f.type) {
    case 'daily':
      return true;

    case 'interval': {
      const daysSince = Math.floor(
        (now.getTime() - new Date(habit.createdAt).getTime()) / 86_400_000,
      );
      return daysSince >= 0 && daysSince % f.every === 0;
    }

    case 'weekly':
      return f.weekdays.includes(now.getDay());

    case 'monthly':
      return f.daysOfMonth.includes(now.getDate());
  }
}

// ─── expectedCompletions ───────────────────────────────────────────────────────

/**
 * Count of expected habit occurrences in the closed interval [from, to].
 *
 * - daily:    number of days in interval
 * - interval: floor(dayCount / every)
 * - weekly:   count occurrences of each weekday in interval
 * - monthly:  count occurrences of each dayOfMonth in interval
 */
export function expectedCompletions(habit: Habit, from: Date, to: Date): number {
  const f = habit.frequency;

  // dayCount = number of full days in [from, to] (inclusive)
  const dayCount = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;

  switch (f.type) {
    case 'daily':
      return dayCount;

    case 'interval':
      return Math.floor(dayCount / f.every);

    case 'weekly': {
      let count = 0;
      for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
        if (f.weekdays.includes(d.getDay())) count++;
      }
      return count;
    }

    case 'monthly': {
      let count = 0;
      for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
        if (f.daysOfMonth.includes(d.getDate())) count++;
      }
      return count;
    }
  }
}
