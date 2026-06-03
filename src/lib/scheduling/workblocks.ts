// workblocks.ts — pure fill algorithm + .ics export. No I/O; `now` injected.
import { rankTasks } from '@/lib/algorithm/score';
import { isReady, effectiveEffortMin } from '@/lib/algorithm/dependencies';
import type { Task, Workblock } from '@/types';

export interface FilledWorkblock extends Workblock {
  filledTasks: Task[];
  remainingMinutes: number;
}

/**
 * Fill a workblock with ready tasks in rankValue order.
 * Greedy: assign tasks until remaining block time < nextTask.effortMin.
 * onOverrun:
 *   'abortTask'   — stop at block boundary; last task may be only partially worked
 *   'extendBlock' — let the last fitting task finish even if it overruns block end
 */
export function fillWorkblock(
  workblock: Workblock,
  allTasks: Task[],
  now: Date
): FilledWorkblock {
  const startMs = new Date(workblock.start).getTime();
  const endMs = new Date(workblock.end).getTime();
  const blockMinutes = (endMs - startMs) / 60_000;

  const openTasks = allTasks.filter((t) => t.status !== 'done');

  // Substitute effective effort, then filter to ready tasks only
  const scorable = openTasks
    .filter((t) => isReady(t.id, allTasks))
    .map((t) => ({ ...t, effortMin: effectiveEffortMin(t, allTasks) }));

  const ranked = rankTasks(scorable, now);

  const filledTasks: Task[] = [];
  let used = 0;

  for (const { task } of ranked) {
    const remaining = blockMinutes - used;
    if (remaining <= 0) break;

    if (task.effortMin <= remaining) {
      filledTasks.push(allTasks.find((t) => t.id === task.id)!);
      used += task.effortMin;
    } else if (workblock.onOverrun === 'extendBlock' && filledTasks.length === 0) {
      // Block is smaller than the top task — still include it once if extendBlock
      filledTasks.push(allTasks.find((t) => t.id === task.id)!);
      used += task.effortMin;
      break;
    }
    // 'abortTask': skip tasks that don't fit
  }

  return { ...workblock, filledTasks, remainingMinutes: blockMinutes - used };
}

/** Format a Date as YYYYMMDDTHHMMSSZ for .ics */
function toIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Escape special characters in .ics text values */
function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * Generate a .ics file string for a filled workblock.
 * Tasks are listed in the DESCRIPTION field.
 */
export function workblockToIcs(filled: FilledWorkblock): string {
  const uid = `workblock-${filled.id}@focusflow`;
  const dtstart = toIcsDate(new Date(filled.start));
  const dtend = toIcsDate(new Date(filled.end));
  const summary = escapeIcs(`Workblock (${filled.filledTasks.length} tasks)`);
  const taskLines = filled.filledTasks
    .map((t, i) => `${i + 1}. ${t.title} (${effectiveEffortMinFromTask(t)}m)`)
    .join('\\n');
  const description = escapeIcs(
    filled.filledTasks.length > 0
      ? `Tasks:\\n${taskLines}`
      : 'No tasks assigned.'
  );

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

function effectiveEffortMinFromTask(t: Task): number {
  return t.effortMin;
}
