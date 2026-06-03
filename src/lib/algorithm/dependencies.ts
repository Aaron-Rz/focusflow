// dependencies.ts — pure DAG helpers for "Must-Do" predecessors (no I/O, `now` injected).
// See CLAUDE.md §7. A task's `dependsOnId` points to a PREDECESSOR that must be `done`
// before this task is "ready". Deadlines propagate backwards: a predecessor must finish
// early enough that its successor can still make its own (possibly inherited) deadline.

import { bufferFactor } from './score';

// Minimal shape this module needs. Real Task (src/types) is a superset.
export interface DepTask {
  id: string;
  effortMin: number;
  deadline?: string;
  dependsOnId?: string;
  parentId?: string;
  status: 'open' | 'done';
}

/**
 * Effective effort for a task used by the scoring pipeline.
 * If the task has at least one non-done direct child, returns the sum of those
 * children's effortMin (the parent is done when all children are done, so its
 * effort is the sum of remaining work). Otherwise returns the task's own effortMin.
 */
export function effectiveEffortMin(task: DepTask, allTasks: DepTask[]): number {
  const activeChildren = allTasks.filter(
    (t) => t.parentId === task.id && t.status !== 'done'
  );
  if (activeChildren.length === 0) return task.effortMin;
  return activeChildren.reduce((sum, c) => sum + c.effortMin, 0);
}

/** A task is ready iff it has no predecessor, or its predecessor is done. */
export function isReady(taskId: string, allTasks: DepTask[]): boolean {
  const task = allTasks.find((t) => t.id === taskId);
  if (!task || !task.dependsOnId) return true;
  const pred = allTasks.find((t) => t.id === task.dependsOnId);
  if (!pred) return true; // dangling predecessor → treat as no dependency
  return pred.status === 'done';
}

/**
 * Returns true if any dependency chain forms a cycle. DFS over the single-edge
 * `dependsOnId` graph; dangling edges are ignored.
 */
export function detectCycle(tasks: DepTask[]): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(tasks.map((t) => [t.id, WHITE]));

  const visit = (id: string): boolean => {
    color.set(id, GRAY);
    const node = byId.get(id);
    const nextId = node?.dependsOnId;
    if (nextId && byId.has(nextId)) {
      const c = color.get(nextId);
      if (c === GRAY) return true; // back-edge → cycle
      if (c === WHITE && visit(nextId)) return true;
    }
    color.set(id, BLACK);
    return false;
  };

  for (const t of tasks) {
    if (color.get(t.id) === WHITE && visit(t.id)) return true;
  }
  return false;
}

/**
 * Effective (derived) deadline for a task. A task that is a predecessor of some
 * successor must finish before the successor can start, so it inherits:
 *   effectiveDeadline(pred) = min(pred.deadline, successor.effectiveDeadline − successor.E_eff)
 * where E_eff is the buffered effort (see score.ts bufferFactor). Walks the successor
 * chain forward. Returns undefined if neither the task nor any successor has a deadline.
 *
 * Guards against cycles by tracking visited ids (returns own deadline if a cycle is hit).
 */
export function effectiveDeadline(
  task: DepTask,
  allTasks: DepTask[],
  _now: Date
): Date | undefined {
  const ownDeadline = task.deadline ? new Date(task.deadline) : undefined;

  // Find the successor: the task that depends on `task`.
  const successor = allTasks.find((t) => t.dependsOnId === task.id);

  const compute = (t: DepTask, seen: Set<string>): Date | undefined => {
    const own = t.deadline ? new Date(t.deadline) : undefined;
    if (seen.has(t.id)) return own; // cycle guard
    seen.add(t.id);
    const succ = allTasks.find((s) => s.dependsOnId === t.id);
    if (!succ) return own;
    const succEff = compute(succ, seen);
    if (!succEff) return own;
    const eEffMs = (succ.effortMin / 60) * bufferFactor(succ.effortMin) * 3.6e6;
    const derived = new Date(succEff.getTime() - eEffMs);
    if (!own) return derived;
    return own.getTime() <= derived.getTime() ? own : derived;
  };

  if (!successor) return ownDeadline;
  return compute(task, new Set<string>());
}
