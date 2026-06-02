export type Importance = 1 | 2 | 3 | 4; // 4 = highest
export type CogLoad = 1 | 2 | 3;        // 3 = highest mental load
export type TaskStatus = 'open' | 'done';

export interface Task {
  id: string;
  title: string;
  effortMin: number;
  importance: Importance;
  cogLoad: CogLoad;
  deadline?: string;
  category?: string;
  parentId?: string;
  dependsOnId?: string;
  status: TaskStatus;
  createdAt: string;
  completedAt?: string;
}

export interface Workblock {
  id: string;
  start: string;
  end: string;
  onOverrun: 'abortTask' | 'extendBlock';
  taskIds: string[];
}

export interface TimerSession {
  id: string;
  taskId: string;
  startedAt: string;
  endedAt?: string;
  pausedMs: number;
}
