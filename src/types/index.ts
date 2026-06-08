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
  categoryFilter?: string[];  // when non-empty, only tasks with matching category are eligible
  pomodoroEnabled?: boolean;
  pomodoroWorkMin?: number;
  pomodoroBreakMin?: number;
}

export interface ScheduleSegment {
  type: 'task' | 'break';
  taskId?: string;
  start: Date;
  end: Date;
  isContinuation: boolean;
}

export interface TimerSession {
  id: string;
  taskId: string;
  startedAt: string;
  endedAt?: string;
  pausedMs: number;
}

export interface Habit {
  id: string;
  title: string;
  frequency: 'daily' | 'weekly' | 'custom';
  /** weekly: day-of-week numbers (0=Sun…6=Sat); custom: [intervalDays] */
  customDays?: number[];
  /** HH:MM — optional fixed target time */
  targetTime?: string;
  /** ISO date strings (YYYY-MM-DD) of completions */
  completionLog: string[];
  createdAt: string;
}
