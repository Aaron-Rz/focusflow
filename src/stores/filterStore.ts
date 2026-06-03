import { create } from 'zustand';

interface FilterStore {
  activeCategories: string[];
  setActiveCategories: (cats: string[]) => void;
  toggleCategory: (cat: string) => void;
  clearFilter: () => void;
}

export const useFilterStore = create<FilterStore>((set, get) => ({
  activeCategories: [],

  setActiveCategories: (cats) => set({ activeCategories: cats }),

  toggleCategory: (cat) => {
    const current = get().activeCategories;
    set({
      activeCategories: current.includes(cat)
        ? current.filter((c) => c !== cat)
        : [...current, cat],
    });
  },

  clearFilter: () => set({ activeCategories: [] }),
}));
