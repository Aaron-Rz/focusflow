import { describe, it, expect } from 'vitest';
import { isDueToday, expectedCompletions } from './schedule';
import type { Task, HabitFrequency } from '@/types';

// ─── test fixture builder ─────────────────────────────────────────────────────

function makeHabit(frequency: HabitFrequency, createdAt = '2024-01-01T00:00:00.000Z'): Task {
  return {
    id: 'test',
    title: 'Test habit',
    effortMin: 15,
    importance: 2,
    cogLoad: 1,
    status: 'open',
    isHabit: true,
    habitFrequency: frequency,
    habitCompletionLog: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function d(dateStr: string): Date {
  return new Date(dateStr);
}

// ─── isDueToday ───────────────────────────────────────────────────────────────

describe('isDueToday — daily', () => {
  const habit = makeHabit({ type: 'daily' });

  it('is due on creation day', () => {
    expect(isDueToday(habit, d('2024-01-01'))).toBe(true);
  });

  it('is due on any future day', () => {
    expect(isDueToday(habit, d('2025-06-15'))).toBe(true);
  });
});

describe('isDueToday — interval', () => {
  // created 2024-01-01, every 3 days → due on day 0, 3, 6, 9 …
  const habit = makeHabit({ type: 'interval', every: 3 }, '2024-01-01T00:00:00.000Z');

  it('is due on creation day (day 0)', () => {
    // day 0: 2024-01-01
    expect(isDueToday(habit, d('2024-01-01T12:00:00.000Z'))).toBe(true);
  });

  it('is not due on day 1', () => {
    expect(isDueToday(habit, d('2024-01-02T12:00:00.000Z'))).toBe(false);
  });

  it('is not due on day 2', () => {
    expect(isDueToday(habit, d('2024-01-03T12:00:00.000Z'))).toBe(false);
  });

  it('is due on day 3', () => {
    expect(isDueToday(habit, d('2024-01-04T12:00:00.000Z'))).toBe(true);
  });

  it('is due on day 6', () => {
    expect(isDueToday(habit, d('2024-01-07T12:00:00.000Z'))).toBe(true);
  });

  it('is not due before creation', () => {
    expect(isDueToday(habit, d('2023-12-31T12:00:00.000Z'))).toBe(false);
  });

  it('every-2 fires on even days from creation', () => {
    const h2 = makeHabit({ type: 'interval', every: 2 }, '2024-01-01T00:00:00.000Z');
    expect(isDueToday(h2, d('2024-01-01T12:00:00.000Z'))).toBe(true);  // day 0
    expect(isDueToday(h2, d('2024-01-02T12:00:00.000Z'))).toBe(false); // day 1
    expect(isDueToday(h2, d('2024-01-03T12:00:00.000Z'))).toBe(true);  // day 2
  });
});

describe('isDueToday — weekly', () => {
  // Mon(1) and Thu(4)
  const habit = makeHabit({ type: 'weekly', weekdays: [1, 4] });

  it('is due on Monday (getDay()===1)', () => {
    // 2024-01-01 is a Monday
    expect(isDueToday(habit, d('2024-01-01'))).toBe(true);
  });

  it('is due on Thursday (getDay()===4)', () => {
    // 2024-01-04 is a Thursday
    expect(isDueToday(habit, d('2024-01-04'))).toBe(true);
  });

  it('is not due on Tuesday', () => {
    // 2024-01-02 is a Tuesday
    expect(isDueToday(habit, d('2024-01-02'))).toBe(false);
  });

  it('is not due on Sunday', () => {
    // 2024-01-07 is a Sunday
    expect(isDueToday(habit, d('2024-01-07'))).toBe(false);
  });

  it('empty weekdays list is never due', () => {
    const h = makeHabit({ type: 'weekly', weekdays: [] });
    expect(isDueToday(h, d('2024-01-01'))).toBe(false);
  });
});

describe('isDueToday — monthly', () => {
  const habit = makeHabit({ type: 'monthly', daysOfMonth: [1, 15] });

  it('is due on the 1st', () => {
    expect(isDueToday(habit, d('2024-03-01'))).toBe(true);
  });

  it('is due on the 15th', () => {
    expect(isDueToday(habit, d('2024-03-15'))).toBe(true);
  });

  it('is not due on the 10th', () => {
    expect(isDueToday(habit, d('2024-03-10'))).toBe(false);
  });

  it('last day of month (31)', () => {
    const h = makeHabit({ type: 'monthly', daysOfMonth: [31] });
    expect(isDueToday(h, d('2024-01-31'))).toBe(true);
    expect(isDueToday(h, d('2024-02-29'))).toBe(false); // Feb 29 is not day 31
  });
});

// ─── expectedCompletions ──────────────────────────────────────────────────────

describe('expectedCompletions — daily', () => {
  const habit = makeHabit({ type: 'daily' });

  it('1 day window = 1', () => {
    expect(expectedCompletions(habit, d('2024-01-01'), d('2024-01-01'))).toBe(1);
  });

  it('7 day window = 7', () => {
    expect(expectedCompletions(habit, d('2024-01-01'), d('2024-01-07'))).toBe(7);
  });

  it('30 day window = 30', () => {
    expect(expectedCompletions(habit, d('2024-01-01'), d('2024-01-30'))).toBe(30);
  });
});

describe('expectedCompletions — interval', () => {
  it('every 3 days, 9-day window → 3 occurrences', () => {
    const habit = makeHabit({ type: 'interval', every: 3 });
    // days 0–8 inclusive = 9 days → floor(9/3) = 3
    expect(expectedCompletions(habit, d('2024-01-01'), d('2024-01-09'))).toBe(3);
  });

  it('every 7 days, 7-day window → 1 occurrence', () => {
    const habit = makeHabit({ type: 'interval', every: 7 });
    expect(expectedCompletions(habit, d('2024-01-01'), d('2024-01-07'))).toBe(1);
  });

  it('every 7 days, 6-day window → 0 occurrences', () => {
    const habit = makeHabit({ type: 'interval', every: 7 });
    expect(expectedCompletions(habit, d('2024-01-01'), d('2024-01-06'))).toBe(0);
  });
});

describe('expectedCompletions — weekly', () => {
  // Mon(1) and Wed(3)
  const habit = makeHabit({ type: 'weekly', weekdays: [1, 3] });

  it('one full Mon–Sun week = 2 occurrences', () => {
    // 2024-01-01 Mon … 2024-01-07 Sun
    expect(expectedCompletions(habit, d('2024-01-01'), d('2024-01-07'))).toBe(2);
  });

  it('two full weeks = 4 occurrences', () => {
    expect(expectedCompletions(habit, d('2024-01-01'), d('2024-01-14'))).toBe(4);
  });

  it('window that clips one occurrence = 1', () => {
    // 2024-01-01 Mon only (not Wed)
    expect(expectedCompletions(habit, d('2024-01-01'), d('2024-01-02'))).toBe(1);
  });

  it('empty weekdays = 0 always', () => {
    const h = makeHabit({ type: 'weekly', weekdays: [] });
    expect(expectedCompletions(h, d('2024-01-01'), d('2024-01-07'))).toBe(0);
  });
});

describe('expectedCompletions — monthly', () => {
  const habit = makeHabit({ type: 'monthly', daysOfMonth: [1, 15] });

  it('whole Jan = 2 occurrences', () => {
    expect(expectedCompletions(habit, d('2024-01-01'), d('2024-01-31'))).toBe(2);
  });

  it('two months = 4 occurrences', () => {
    expect(expectedCompletions(habit, d('2024-01-01'), d('2024-02-29'))).toBe(4);
  });

  it('window that misses both days = 0', () => {
    // Jan 2–14 has neither 1st nor 15th
    expect(expectedCompletions(habit, d('2024-01-02'), d('2024-01-14'))).toBe(0);
  });

  it('single day 31 in Jan = 1', () => {
    const h = makeHabit({ type: 'monthly', daysOfMonth: [31] });
    expect(expectedCompletions(h, d('2024-01-31'), d('2024-01-31'))).toBe(1);
  });
});
