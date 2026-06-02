// dependencies.test.ts — Vitest. Covers ready-check, cycle detection, deadline propagation.
// Run: npx vitest run dependencies.test.ts

import { describe, it, expect } from 'vitest';
import { isReady, detectCycle, effectiveDeadline, type DepTask } from './dependencies';
import { bufferFactor } from './score';

const NOW = new Date('2026-06-02T08:00:00.000Z');
const inHours = (h: number) => new Date(NOW.getTime() + h * 3.6e6).toISOString();

const mk = (over: Partial<DepTask> & { id: string }): DepTask => ({
  effortMin: 60,
  status: 'open',
  ...over,
});

describe('isReady', () => {
  it('task with no dependency is ready', () => {
    const tasks = [mk({ id: 'a' })];
    expect(isReady('a', tasks)).toBe(true);
  });

  it('task whose dependency is done is ready', () => {
    const tasks = [mk({ id: 'a', status: 'done' }), mk({ id: 'b', dependsOnId: 'a' })];
    expect(isReady('b', tasks)).toBe(true);
  });

  it('task whose dependency is open is NOT ready', () => {
    const tasks = [mk({ id: 'a', status: 'open' }), mk({ id: 'b', dependsOnId: 'a' })];
    expect(isReady('b', tasks)).toBe(false);
  });

  it('dangling dependency (predecessor missing) is treated as ready', () => {
    const tasks = [mk({ id: 'b', dependsOnId: 'ghost' })];
    expect(isReady('b', tasks)).toBe(true);
  });
});

describe('detectCycle', () => {
  it('no cycle in a plain chain A→B→C', () => {
    const tasks = [
      mk({ id: 'a' }),
      mk({ id: 'b', dependsOnId: 'a' }),
      mk({ id: 'c', dependsOnId: 'b' }),
    ];
    expect(detectCycle(tasks)).toBe(false);
  });

  it('detects a 2-node cycle A→B→A', () => {
    const tasks = [mk({ id: 'a', dependsOnId: 'b' }), mk({ id: 'b', dependsOnId: 'a' })];
    expect(detectCycle(tasks)).toBe(true);
  });

  it('detects a self-loop A→A', () => {
    const tasks = [mk({ id: 'a', dependsOnId: 'a' })];
    expect(detectCycle(tasks)).toBe(true);
  });

  it('ignores dangling edges (no false positive)', () => {
    const tasks = [mk({ id: 'a', dependsOnId: 'ghost' })];
    expect(detectCycle(tasks)).toBe(false);
  });
});

describe('effectiveDeadline', () => {
  it('returns undefined when neither task nor any successor has a deadline', () => {
    const tasks = [mk({ id: 'a' }), mk({ id: 'b', dependsOnId: 'a' })];
    const a = tasks[0];
    expect(effectiveDeadline(a, tasks, NOW)).toBeUndefined();
  });

  it("returns the task's own deadline when it has no successor", () => {
    const tasks = [mk({ id: 'a', deadline: inHours(10) })];
    expect(effectiveDeadline(tasks[0], tasks, NOW)?.toISOString()).toBe(inHours(10));
  });

  it('propagates a deadline back across a 2-level chain A→B→C', () => {
    // C (deadline NOW+10h) depends on B, B depends on A. effortMin=60 each → E_eff=1.06h.
    const tasks = [
      mk({ id: 'a' }),
      mk({ id: 'b', dependsOnId: 'a' }),
      mk({ id: 'c', dependsOnId: 'b', deadline: inHours(10) }),
    ];
    const a = tasks.find((t) => t.id === 'a')!;
    const b = tasks.find((t) => t.id === 'b')!;

    const eEffH = (60 / 60) * bufferFactor(60); // 1.06h
    const expectB = NOW.getTime() + (10 - eEffH) * 3.6e6;
    const expectA = NOW.getTime() + (10 - 2 * eEffH) * 3.6e6;

    expect(effectiveDeadline(b, tasks, NOW)!.getTime()).toBeCloseTo(expectB, 0);
    expect(effectiveDeadline(a, tasks, NOW)!.getTime()).toBeCloseTo(expectA, 0);
  });

  it("uses the tighter of own vs derived deadline", () => {
    // Predecessor A has its own early deadline that beats the derived one.
    const tasks = [
      mk({ id: 'a', deadline: inHours(1) }),
      mk({ id: 'b', dependsOnId: 'a', deadline: inHours(10) }),
    ];
    const a = tasks[0];
    // derived = NOW+10h − 1.06h ≈ NOW+8.94h; own = NOW+1h → own wins.
    expect(effectiveDeadline(a, tasks, NOW)?.toISOString()).toBe(inHours(1));
  });
});
