import { db } from './dexie';
import type { Task, Workblock, TimerSession, Habit } from '@/types';

interface BackupData {
  tasks: Task[];
  workblocks: Workblock[];
  timerSessions: TimerSession[];
  habits?: Habit[];
}

export async function exportToJSON(): Promise<string> {
  const [tasks, workblocks, timerSessions, habits] = await Promise.all([
    db.tasks.toArray(),
    db.workblocks.toArray(),
    db.timerSessions.toArray(),
    db.habits.toArray(),
  ]);
  const data: BackupData = { tasks, workblocks, timerSessions, habits };
  return JSON.stringify(data, null, 2);
}

export async function importFromJSON(json: string): Promise<void> {
  const data: BackupData = JSON.parse(json) as BackupData;
  await db.transaction('rw', [db.tasks, db.workblocks, db.timerSessions, db.habits], async () => {
    await db.tasks.clear();
    await db.workblocks.clear();
    await db.timerSessions.clear();
    await db.habits.clear();
    await db.tasks.bulkAdd(data.tasks ?? []);
    await db.workblocks.bulkAdd(data.workblocks ?? []);
    await db.timerSessions.bulkAdd(data.timerSessions ?? []);
    if (data.habits?.length) await db.habits.bulkAdd(data.habits);
  });
}
