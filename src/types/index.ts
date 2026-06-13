export type Importance = 1 | 2 | 3 | 4; // 4 = highest
export type CogLoad = 1 | 2 | 3;        // 3 = highest mental load
export type TaskStatus = 'open' | 'done';

export type HabitFrequency =
  | { type: 'daily' }
  | { type: 'interval'; every: number }        // every N days from creation date
  | { type: 'weekly'; weekdays: number[] }     // 0=Sun … 6=Sat
  | { type: 'monthly'; daysOfMonth: number[] }; // 1–31

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
  updatedAt: string;
  // habit fields (only relevant when isHabit = true)
  isHabit?: boolean;
  habitFrequency?: HabitFrequency;
  habitCompletionLog?: string[];  // ISO datetime strings of completions
  targetTime?: string;            // HH:MM optional fixed target time
}

export interface Workblock {
  id: string;
  start: string;
  end: string;
  onOverrun: 'abortTask' | 'extendBlock';
  taskIds: string[];
  categoryFilter?: string[];
  includeHabits?: boolean;
  pomodoroEnabled?: boolean;
  pomodoroWorkMin?: number;
  pomodoroBreakMin?: number;
  updatedAt: string;
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
  updatedAt: string;
}

