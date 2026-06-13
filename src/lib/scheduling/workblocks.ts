// workblocks.ts — fill algorithm (flat + Pomodoro) + .ics export. No I/O; `now` injected.
import { rankTasks } from '@/lib/algorithm/score';
import { isReady, effectiveEffortMin } from '@/lib/algorithm/dependencies';
import { isDueToday } from '@/lib/habits/schedule';
import type { Task, Workblock, ScheduleSegment } from '@/types';

export interface FilledWorkblock extends Workblock {
  /** Unique tasks assigned, in order of first appearance. */
  filledTasks: Task[];
  /** Full schedule including break segments (Pomodoro) or single task list (flat). */
  segments: ScheduleSegment[];
  /** Total task-work minutes not assigned within the block. */
  remainingMinutes: number;
}

// ---------------------------------------------------------------------------
// Slot helpers
// ---------------------------------------------------------------------------

interface Slot {
  type: 'work' | 'break';
  start: Date;
  end: Date;
}

/** Divide [blockStart, blockEnd) into alternating work/break slots, clipped to boundary. */
function buildSlots(
  blockStart: Date,
  blockEnd: Date,
  workMin: number,
  breakMin: number
): Slot[] {
  const slots: Slot[] = [];
  let cursor = blockStart.getTime();
  const endMs = blockEnd.getTime();

  while (cursor < endMs) {
    const workEnd = Math.min(cursor + workMin * 60_000, endMs);
    slots.push({ type: 'work', start: new Date(cursor), end: new Date(workEnd) });
    cursor = workEnd;
    if (cursor >= endMs) break;
    const breakEnd = Math.min(cursor + breakMin * 60_000, endMs);
    slots.push({ type: 'break', start: new Date(cursor), end: new Date(breakEnd) });
    cursor = breakEnd;
  }
  return slots;
}

// ---------------------------------------------------------------------------
// Task queue
// ---------------------------------------------------------------------------

interface QueueEntry {
  task: Task;
  remainingMin: number;
  started: boolean; // true once any segment has been placed for this task
}

// ---------------------------------------------------------------------------
// Pomodoro fill: tasks split freely across slot boundaries
// ---------------------------------------------------------------------------

function fillPomodoro(
  slots: Slot[],
  queue: QueueEntry[],
  onOverrun: Workblock['onOverrun'],
  blockEnd: Date
): ScheduleSegment[] {
  const segments: ScheduleSegment[] = [];

  for (const slot of slots) {
    if (slot.type === 'break') {
      segments.push({ type: 'break', start: slot.start, end: slot.end, isContinuation: false });
      continue;
    }

    let cursorMs = slot.start.getTime();
    const slotEndMs = slot.end.getTime();

    while (cursorMs < slotEndMs && queue.length > 0) {
      const entry = queue[0];
      const availableMin = (slotEndMs - cursorMs) / 60_000;
      const doMin = Math.min(entry.remainingMin, availableMin);
      const segEnd = new Date(cursorMs + doMin * 60_000);

      segments.push({
        type: 'task',
        taskId: entry.task.id,
        start: new Date(cursorMs),
        end: segEnd,
        isContinuation: entry.started,
      });

      entry.started = true;
      entry.remainingMin -= doMin;

      if (entry.remainingMin < 0.001) {
        queue.shift();
      }

      cursorMs = segEnd.getTime();
    }

    if (queue.length === 0) break;
  }

  // extendBlock: if the last task segment was clipped at the block end, extend it.
  if (onOverrun === 'extendBlock' && queue.length > 0) {
    const lastTask = [...segments].reverse().find((s) => s.type === 'task');
    if (lastTask && lastTask.end.getTime() >= blockEnd.getTime()) {
      const entry = queue[0];
      lastTask.end = new Date(lastTask.end.getTime() + entry.remainingMin * 60_000);
      entry.remainingMin = 0;
      queue.shift();
    }
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Flat fill: greedy, no splitting — tasks that don't fit are skipped.
// (Original Milestone 6 behaviour.)
// ---------------------------------------------------------------------------

function fillFlat(
  blockStart: Date,
  blockEnd: Date,
  queue: QueueEntry[],
  onOverrun: Workblock['onOverrun']
): ScheduleSegment[] {
  const segments: ScheduleSegment[] = [];
  let cursorMs = blockStart.getTime();
  const endMs = blockEnd.getTime();

  for (const entry of queue) {
    const remaining = (endMs - cursorMs) / 60_000;
    if (remaining <= 0) break;

    if (entry.remainingMin <= remaining) {
      const segEnd = new Date(cursorMs + entry.remainingMin * 60_000);
      segments.push({
        type: 'task',
        taskId: entry.task.id,
        start: new Date(cursorMs),
        end: segEnd,
        isContinuation: false,
      });
      cursorMs = segEnd.getTime();
    } else if (onOverrun === 'extendBlock' && segments.length === 0) {
      // Block smaller than top task — include it once and extend.
      const segEnd = new Date(cursorMs + entry.remainingMin * 60_000);
      segments.push({
        type: 'task',
        taskId: entry.task.id,
        start: new Date(cursorMs),
        end: segEnd,
        isContinuation: false,
      });
      break;
    }
    // abortTask: skip tasks that don't fit
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function fillWorkblock(
  workblock: Workblock,
  allTasks: Task[],
  now: Date
): FilledWorkblock {
  const startDate = new Date(workblock.start);
  const endDate = new Date(workblock.end);
  const blockMinutes = (endDate.getTime() - startDate.getTime()) / 60_000;

  // Rank ready open tasks by score, optionally scoped to specific categories
  const catFilter = workblock.categoryFilter;
  const includeHabits = workblock.includeHabits ?? false;
  const openTasks = allTasks.filter((t) => {
    if (t.status === 'done') return false;
    // Habit tasks: only include if the toggle is on and the habit is due today
    if (t.isHabit) {
      if (!includeHabits) return false;
      if (!isDueToday(t, startDate)) return false;
    }
    if (catFilter && catFilter.length > 0) {
      return t.category != null && catFilter.includes(t.category);
    }
    return true;
  });
  const scorable = openTasks
    .filter((t) => isReady(t.id, allTasks))
    .map((t) => ({ ...t, effortMin: effectiveEffortMin(t, allTasks) }));
  const ranked = rankTasks(scorable, now);

  const queue: QueueEntry[] = ranked.map(({ task }) => ({
    task: allTasks.find((t) => t.id === task.id)!,
    remainingMin: task.effortMin,
    started: false,
  }));

  let segments: ScheduleSegment[];

  if (workblock.pomodoroEnabled) {
    const workMin = workblock.pomodoroWorkMin ?? 25;
    const breakMin = workblock.pomodoroBreakMin ?? 5;
    const slots = buildSlots(startDate, endDate, workMin, breakMin);
    segments = fillPomodoro(slots, queue, workblock.onOverrun, endDate);
  } else {
    segments = fillFlat(startDate, endDate, queue, workblock.onOverrun);
  }

  // Unique task objects in first-appearance order
  const seenIds = new Set<string>();
  const filledTasks: Task[] = [];
  for (const seg of segments) {
    if (seg.type === 'task' && seg.taskId && !seenIds.has(seg.taskId)) {
      seenIds.add(seg.taskId);
      const t = allTasks.find((x) => x.id === seg.taskId);
      if (t) filledTasks.push(t);
    }
  }

  const usedMin = segments
    .filter((s) => s.type === 'task')
    .reduce((sum, s) => sum + (s.end.getTime() - s.start.getTime()) / 60_000, 0);

  return {
    ...workblock,
    filledTasks,
    segments,
    remainingMinutes: Math.max(0, blockMinutes - usedMin),
  };
}

// ---------------------------------------------------------------------------
// .ics export
// ---------------------------------------------------------------------------

function toIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function workblockToIcs(filled: FilledWorkblock, taskMap: Map<string, Task>): string {
  const uid = `workblock-${filled.id}@focusflow`;
  const dtstart = toIcsDate(new Date(filled.start));
  const dtend = toIcsDate(new Date(filled.end));
  const summary = escapeIcs(`Workblock (${filled.filledTasks.length} tasks)`);

  const fmt = (d: Date) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const lines: string[] = [];
  if (filled.segments.length === 0) {
    lines.push('No tasks assigned.');
  } else {
    for (const seg of filled.segments) {
      if (seg.type === 'break') {
        lines.push(`[Break ${fmt(seg.start)}–${fmt(seg.end)}]`);
      } else if (seg.taskId) {
        const label = taskMap.get(seg.taskId)?.title ?? seg.taskId;
        const cont = seg.isContinuation ? ' (cont.)' : '';
        lines.push(`${fmt(seg.start)}–${fmt(seg.end)} ${label}${cont}`);
      }
    }
  }

  const description = escapeIcs(lines.join('\n'));

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FocusFlow//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
