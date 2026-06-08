import Dexie, { type EntityTable } from 'dexie';
import type { Task, Workblock, TimerSession, Habit } from '@/types';

class FocusFlowDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  workblocks!: EntityTable<Workblock, 'id'>;
  timerSessions!: EntityTable<TimerSession, 'id'>;
  habits!: EntityTable<Habit, 'id'>;

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
  }
}

export const db = new FocusFlowDB();
