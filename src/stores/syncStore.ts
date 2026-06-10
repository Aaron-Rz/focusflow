import { create } from 'zustand';

export type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncStore {
  userId: string | null;
  userEmail: string | null;
  username: string | null;
  syncing: boolean;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
  syncError: string | null;

  setUser: (id: string | null, email: string | null) => void;
  setUsername: (username: string | null) => void;
  setSyncing: (v: boolean) => void;
  setLastSyncedAt: (at: string) => void;
  setError: (e: string | null) => void;
  clearError: () => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  userId: null,
  userEmail: null,
  username: null,
  syncing: false,
  syncStatus: 'idle',
  lastSyncedAt: null,
  error: null,
  syncError: null,

  setUser: (id, email) => set({ userId: id, userEmail: email }),
  setUsername: (username) => set({ username }),
  setSyncing: (v) => set((s) => ({
    syncing: v,
    syncStatus: v ? 'syncing' : (s.error ? 'error' : 'idle'),
  })),
  setLastSyncedAt: (at) => set({ lastSyncedAt: at, syncStatus: 'idle' }),
  setError: (e) => set({ error: e, syncError: e, syncStatus: e ? 'error' : 'idle' }),
  clearError: () => set({ error: null, syncError: null, syncStatus: 'idle' }),
}));
