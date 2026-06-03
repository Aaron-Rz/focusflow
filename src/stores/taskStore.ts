import { create } from 'zustand';
import { db } from '@/lib/db/dexie';
import type { Task, Importance, CogLoad } from '@/types';
import { detectCycle } from '@/lib/algorithm/dependencies';
import { v4 as uuidv4 } from 'uuid';

/** Returns the nesting depth of a task: 0 = top-level, 1 = child, 2 = grandchild. */
export function getTaskDepth(taskId: string, tasks: Task[]): number {
  const task = tasks.find((t) => t.id === taskId);
  if (!task || !task.parentId) return 0;
  return 1 + getTaskDepth(task.parentId, tasks);
}

interface TaskStore {
  tasks: Task[];
  loading: boolean;
  loadTasks: () => Promise<void>;
  /** Returns an error string on failure, null on success. */
  addTask: (input: {
    title: string;
    effortMin: number;
    importance: Importance;
    cogLoad: CogLoad;
    deadline?: string;
    category?: string;
    dependsOnId?: string;
    parentId?: string;
  }) => Promise<string | null>;
  markDone: (id: string) => Promise<void>;
  markOpen: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  // Set/clear a Must-Do predecessor. Rejects (returns an error message) if it would
  // create a cycle; returns null on success.
  setDependency: (taskId: string, dependsOnId: string | undefined) => Promise<string | null>;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  loading: false,

  loadTasks: async () => {
    set({ loading: true });
    const tasks = await db.tasks.toArray();
    set({ tasks, loading: false });
  },

  addTask: async (input) => {
    const current = get().tasks;
    if (input.parentId) {
      const parentDepth = getTaskDepth(input.parentId, current);
      if (parentDepth >= 2) {
        return 'Cannot add a subtask here — maximum depth is 2 (grandchild level).';
      }
    }
    // Cycle check for sibling Must-Do dependency
    if (input.dependsOnId) {
      const mockTask: Task = {
        id: '__new__',
        title: '',
        effortMin: input.effortMin,
        importance: input.importance,
        cogLoad: input.cogLoad,
        dependsOnId: input.dependsOnId,
        parentId: input.parentId,
        status: 'open',
        createdAt: new Date().toISOString(),
      };
      if (detectCycle([...current, mockTask])) {
        return 'That dependency would create a cycle.';
      }
    }
    const task: Task = {
      id: uuidv4(),
      title: input.title,
      effortMin: input.effortMin,
      importance: input.importance,
      cogLoad: input.cogLoad,
      deadline: input.deadline || undefined,
      category: input.category || undefined,
      dependsOnId: input.dependsOnId || undefined,
      parentId: input.parentId || undefined,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    await db.tasks.add(task);
    await get().loadTasks();
    return null;
  },

  markDone: async (id) => {
    await db.tasks.update(id, { status: 'done', completedAt: new Date().toISOString() });
    await get().loadTasks();
  },

  markOpen: async (id) => {
    await db.tasks.update(id, { status: 'open', completedAt: undefined });
    await get().loadTasks();
  },

  deleteTask: async (id) => {
    await db.tasks.delete(id);
    await get().loadTasks();
  },

  setDependency: async (taskId, dependsOnId) => {
    if (dependsOnId === taskId) return 'A task cannot depend on itself.';
    // Simulate the change against current tasks and reject if it forms a cycle.
    const candidate = get().tasks.map((t) =>
      t.id === taskId ? { ...t, dependsOnId } : t
    );
    if (detectCycle(candidate)) {
      return 'That dependency would create a cycle.';
    }
    await db.tasks.update(taskId, { dependsOnId: dependsOnId ?? undefined });
    await get().loadTasks();
    return null;
  },
}));
