import type { Task } from '@/types';

export function getDistinctCategories(allTasks: Task[]): string[] {
  const seen = new Set<string>();
  for (const t of allTasks) {
    if (t.category) seen.add(t.category);
  }
  return [...seen].sort();
}
