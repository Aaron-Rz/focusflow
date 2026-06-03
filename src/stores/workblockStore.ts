import { create } from 'zustand';
import { db } from '@/lib/db/dexie';
import type { Workblock } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface WorkblockStore {
  workblocks: Workblock[];
  loading: boolean;
  loadWorkblocks: () => Promise<void>;
  addWorkblock: (input: Omit<Workblock, 'id' | 'taskIds'>) => Promise<Workblock>;
  updateWorkblock: (id: string, taskIds: string[]) => Promise<void>;
  deleteWorkblock: (id: string) => Promise<void>;
}

export const useWorkblockStore = create<WorkblockStore>((set, get) => ({
  workblocks: [],
  loading: false,

  loadWorkblocks: async () => {
    set({ loading: true });
    const workblocks = await db.workblocks.toArray();
    set({ workblocks, loading: false });
  },

  addWorkblock: async (input) => {
    const wb: Workblock = { id: uuidv4(), taskIds: [], ...input };
    await db.workblocks.add(wb);
    await get().loadWorkblocks();
    return wb;
  },

  updateWorkblock: async (id, taskIds) => {
    await db.workblocks.update(id, { taskIds });
    await get().loadWorkblocks();
  },

  deleteWorkblock: async (id) => {
    await db.workblocks.delete(id);
    await get().loadWorkblocks();
  },
}));
