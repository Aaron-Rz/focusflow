import { create } from 'zustand';

interface SyncStore {
  userId: string | null;
  userEmail: string | null;
  username: string | null;
  syncing: boolean;
  lastSyncedAt: string | null;
  error: string | null;

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
  lastSyncedAt: null,
  error: null,

  setUser: (id, email) => set({ userId: id, userEmail: email }),
  setUsername: (username) => set({ username }),
  setSyncing: (v) => set({ syncing: v }),
  setLastSyncedAt: (at) => set({ lastSyncedAt: at }),
  setError: (e) => set({ error: e }),
  clearError: () => set({ error: null }),
}));
