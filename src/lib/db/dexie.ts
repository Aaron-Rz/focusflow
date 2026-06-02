import Dexie, { type EntityTable } from 'dexie';
import type { Task, Workblock, TimerSession } from '@/types';

class FocusFlowDB extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  workblocks!: EntityTable<Workblock, 'id'>;
  timerSessions!: EntityTable<TimerSession, 'id'>;

  constructor() {
    super('focusflow');
    this.version(1).stores({
      tasks: 'id, status, parentId, dependsOnId, category, deadline',
      workblocks: 'id, start, end',
      timerSessions: 'id, taskId, startedAt',
    });
  }
}

export const db = new FocusFlowDB();
