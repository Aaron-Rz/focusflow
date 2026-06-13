import Dexie, { type EntityTable } from 'dexie';
import type { Task, Workblock, TimerSession, HabitFrequency } from '@/types';

/** Tombstone: records a deletion so it propagates to other devices instead of resurrecting. */
export interface Deletion {
  id: string;          // the deleted row's id
  entity: 'tasks' | 'workblocks' | 'timer_sessions' | 'habits';
  deletedAt: string;   // ISO
}

class FocusFlowDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  workblocks!: EntityTable<Workblock, 'id'>;
  timerSessions!: EntityTable<TimerSession, 'id'>;
  deletions!: EntityTable<Deletion, 'id'>;

  constructor() {
    super('focusflow');

    this.version(1).stores({
      tasks: 'id, status, parentId, dependsOnId, category, deadline',
      workblocks: 'id, start, end',
      timerSessions: 'id, taskId, startedAt',
    });

    this.version(2).stores({
      tasks: 'id, status, parentId, dependsOnId, category, deadline',
      workblocks: 'id, start, end',
      timerSessions: 'id, taskId, startedAt',
      habits: 'id, frequency, createdAt',
    });

    this.version(3)
      .stores({
        tasks: 'id, status, parentId, dependsOnId, category, deadline, updatedAt',
        workblocks: 'id, start, end, updatedAt',
        timerSessions: 'id, taskId, startedAt, updatedAt',
        habits: 'id, frequency, createdAt, updatedAt',
      })
      .upgrade((tx) => {
        const now = new Date().toISOString();
        return Promise.all([
          tx
            .table('tasks')
            .toCollection()
            .modify((t) => {
              if (!t.updatedAt) t.updatedAt = t.createdAt ?? now;
            }),
          tx
            .table('workblocks')
            .toCollection()
            .modify((w) => {
              if (!w.updatedAt) w.updatedAt = w.start ?? now;
            }),
          tx
            .table('timerSessions')
            .toCollection()
            .modify((s) => {
              if (!s.updatedAt) s.updatedAt = s.startedAt ?? now;
            }),
          tx
            .table('habits')
            .toCollection()
            .modify((h) => {
              if (!h.updatedAt) h.updatedAt = h.createdAt ?? now;
            }),
        ]);
      });

    this.version(4).stores({
      tasks: 'id, status, parentId, dependsOnId, category, deadline, updatedAt',
      workblocks: 'id, start, end, updatedAt',
      timerSessions: 'id, taskId, startedAt, updatedAt',
      habits: 'id, frequency, createdAt, updatedAt',
      deletions: 'id, entity, deletedAt',
    });

    // v5: HabitFrequency becomes a structured object; remove the `frequency` index
    // (can't meaningfully index a JSON object field). Migrate legacy string-based habits.
    this.version(5)
      .stores({
        tasks: 'id, status, parentId, dependsOnId, category, deadline, updatedAt',
        workblocks: 'id, start, end, updatedAt',
        timerSessions: 'id, taskId, startedAt, updatedAt',
        habits: 'id, createdAt, updatedAt',
        deletions: 'id, entity, deletedAt',
      })
      .upgrade((tx) => {
        return tx
          .table('habits')
          .toCollection()
          .modify((h: Record<string, unknown>) => {
            if (typeof h.frequency !== 'string') return; // already migrated
            const old = h.frequency as string;
            const customDays = h.customDays as number[] | undefined;
            let freq: HabitFrequency;
            if (old === 'daily') {
              freq = { type: 'daily' };
            } else if (old === 'weekly') {
              freq = { type: 'weekly', weekdays: customDays ?? [] };
            } else {
              // 'custom' — interval stored as [intervalDays]
              freq = { type: 'interval', every: customDays?.[0] ?? 1 };
            }
            h.frequency = freq;
            delete h.customDays;
          });
      });

    // v6: Habits are now Tasks with isHabit = true. Migrate habit rows into tasks
    // and drop the habits table.
    this.version(6)
      .stores({
        tasks: 'id, status, parentId, dependsOnId, category, deadline, updatedAt',
        workblocks: 'id, start, end, updatedAt',
        timerSessions: 'id, taskId, startedAt, updatedAt',
        habits: null, // drop the table
        deletions: 'id, entity, deletedAt',
      })
      .upgrade(async (tx) => {
        const habits = await tx.table('habits').toArray() as Record<string, unknown>[];
        for (const h of habits) {
          const existing = await tx.table('tasks').get(h.id as string);
          if (existing) continue; // already migrated (shouldn't happen)
          const now = (h.updatedAt as string) ?? new Date().toISOString();
          await tx.table('tasks').add({
            id: h.id,
            title: h.title,
            effortMin: 15,
            importance: 2,
            cogLoad: 1,
            status: 'open',
            createdAt: h.createdAt,
            updatedAt: now,
            isHabit: true,
            habitFrequency: h.frequency,
            habitCompletionLog: (h.completionLog as string[]) ?? [],
            targetTime: h.targetTime ?? undefined,
          });
        }
      });
  }
}

export const db = new FocusFlowDB();
