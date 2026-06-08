import Dexie, { type EntityTable } from 'dexie';
import type { Task, Workblock, TimerSession, Habit } from '@/types';

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
  habits!: EntityTable<Habit, 'id'>;
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
  }
}

export const db = new FocusFlowDB();
