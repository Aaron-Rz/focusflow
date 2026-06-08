import { create } from 'zustand';
import { db } from '@/lib/db/dexie';
import type { Workblock } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { syncUpsertWorkblock, syncDeleteWorkblock } from '@/lib/sync/supabase-sync';

interface WorkblockStore {
  workblocks: Workblock[];
  loading: boolean;
  loadWorkblocks: () => Promise<void>;
  addWorkblock: (input: Omit<Workblock, 'id' | 'taskIds' | 'updatedAt'>) => Promise<Workblock>;
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
    const now = new Date().toISOString();
    const wb: Workblock = { id: uuidv4(), taskIds: [], updatedAt: now, ...input };
    await db.workblocks.add(wb);
    syncUpsertWorkblock(wb);
    await get().loadWorkblocks();
    return wb;
  },

  updateWorkblock: async (id, taskIds) => {
    const now = new Date().toISOString();
    await db.workblocks.update(id, { taskIds, updatedAt: now });
    const updated = await db.workblocks.get(id);
    if (updated) syncUpsertWorkblock(updated);
    await get().loadWorkblocks();
  },

  deleteWorkblock: async (id) => {
    await db.workblocks.delete(id);
    syncDeleteWorkblock(id);
    await get().loadWorkblocks();
  },
}));
