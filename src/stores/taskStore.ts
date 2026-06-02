import { create } from 'zustand';
import { db } from '@/lib/db/dexie';
import type { Task, Importance, CogLoad } from '@/types';
import { detectCycle } from '@/lib/algorithm/dependencies';
import { v4 as uuidv4 } from 'uuid';

interface TaskStore {
  tasks: Task[];
  loading: boolean;
  loadTasks: () => Promise<void>;
  addTask: (input: {
    title: string;
    effortMin: number;
    importance: Importance;
    cogLoad: CogLoad;
    deadline?: string;
    category?: string;
    dependsOnId?: string;
    parentId?: string;
  }) => Promise<void>;
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
