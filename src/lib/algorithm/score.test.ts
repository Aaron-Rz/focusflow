// score.test.ts — Vitest. Hand-verified reference values for the prioritization algorithm.
// Every number was computed independently and confirmed numerically (not from memory).
// Run: npx vitest run score.test.ts
//
// Model: score = w_u·U·gate(imp) + w_e·EP + w_i·IMP + w_c·CL
//   W={u:.5,e:.25,i:.2,c:.05}; K_URGENCY=4, RATIO_MID=0.8; BUFFER=min(0.06·h,0.5);
//   EFFORT_REF_HOURS=8 (ln9=2.197225); IMP={1:0,2:1/3,3:2/3,4:1}; CL={1:0,2:.5,3:1};
//   QUICK_TASK_MIN=10; gate = a + (1−a)·IMP, a=URGENCY_IMPORTANCE_FLOOR=0.5.

const NOW = new Date("2025-06-02T08:00:00.000Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 3.6e6).toISOString();

import { describe, it, expect } from "vitest";
import { scoreTask, rankTasks, bufferFactor, isOverdue, CONFIG, type ScorableTask } from "./score";

// ── Core worked cases (gate shown where U>0) ────────────────────────────────
const TC1: ScorableTask = { effortMin: 120, importance: 3, cogLoad: 2 }; // no deadline
const TC2: ScorableTask = { effortMin: 5, importance: 2, cogLoad: 1 }; // quick, no deadline
const TC3: ScorableTask = { effortMin: 60, importance: 2, cogLoad: 2, deadline: inHours(-1) }; // overdue
const TC4: ScorableTask = { effortMin: 240, importance: 4, cogLoad: 3, deadline: inHours(4) }; // long, at-risk
const TC5a: ScorableTask = { effortMin: 8, importance: 2, cogLoad: 1, deadline: inHours(0.2) }; // quick, comfortable
const TC5b: ScorableTask = { effortMin: 8, importance: 2, cogLoad: 1, deadline: inHours(0.1) }; // quick, at-risk

describe("scoreTask — verified worked values (gated urgency)", () => {
  it("TC1 no-deadline medium task → U=0, score 0.283333", () => {
    const r = scoreTask(TC1, NOW);
    expect(r.urgency).toBe(0);
    expect(r.effortPriority).toBeCloseTo(0.5, 3);
    expect(r.score).toBeCloseTo(0.283333, 3);
    expect(r.isAtRisk).toBe(false);
  });
  it("TC2 quick no-deadline task → 0.066667", () => {
    const r = scoreTask(TC2, NOW);
    expect(r.effortPriority).toBe(0);
    expect(r.score).toBeCloseTo(0.066667, 3);
  });
  it("TC3 overdue, mid-importance → U=1 but gate=2/3 → score 0.503866", () => {
    const r = scoreTask(TC3, NOW);
    expect(r.urgency).toBe(1);
    expect(r.importanceGate).toBeCloseTo(0.66667, 4);
    expect(r.score).toBeCloseTo(0.503866, 3);
    expect(r.isAtRisk).toBe(true);
  });
  it("TC4 long important at-risk → gate=1 → score 0.859727", () => {
    const r = scoreTask(TC4, NOW);
    expect(r.urgency).toBeCloseTo(0.85321, 3);
    expect(r.importanceGate).toBe(1);
    expect(r.score).toBeCloseTo(0.859727, 3);
    expect(r.isAtRisk).toBe(true);
  });
  it("TC5a quick comfortable → low, not at risk → 0.191575", () => {
    const r = scoreTask(TC5a, NOW);
    expect(r.score).toBeCloseTo(0.191575, 3);
    expect(r.isAtRisk).toBe(false);
  });
  it("TC5b quick imminent → urgency rescue (but gated) → 0.366025, at risk", () => {
    const r = scoreTask(TC5b, NOW);
    expect(r.score).toBeCloseTo(0.366025, 3);
    expect(r.isAtRisk).toBe(true);
  });
});

describe("importance gating generalizes the legacy additive model", () => {
  it("a=1 recovers pure additive: TC5b → 0.515703 (old value)", () => {
    const r = scoreTask(TC5b, NOW, { ...CONFIG, URGENCY_IMPORTANCE_FLOOR: 1 });
    expect(r.importanceGate).toBe(1);
    expect(r.score).toBeCloseTo(0.515703, 3);
  });
});

// ── Mere-urgency effect (Zhu et al. 2018): gating must fix it ────────────────
const MU_LOW: ScorableTask = { effortMin: 30, importance: 1, cogLoad: 1, deadline: inHours(0.4) }; // trivial, at-risk
const MU_HIGH: ScorableTask = { effortMin: 60, importance: 4, cogLoad: 2, deadline: inHours(3) }; // important, moderate

describe("mere-urgency correction", () => {
  it("WITHOUT gating (a=1) the trivial urgent task wins — the documented bias", () => {
    const cfg = { ...CONFIG, URGENCY_IMPORTANCE_FLOOR: 1 };
    expect(scoreTask(MU_LOW, NOW, cfg).score).toBeCloseTo(0.483857, 3);
    expect(scoreTask(MU_HIGH, NOW, cfg).score).toBeCloseTo(0.375607, 3);
    expect(scoreTask(MU_LOW, NOW, cfg).score).toBeGreaterThan(scoreTask(MU_HIGH, NOW, cfg).score);
  });
  it("WITH gating (default a=0.5) the important task wins — bias corrected", () => {
    expect(scoreTask(MU_LOW, NOW).score).toBeCloseTo(0.264995, 3);
    expect(scoreTask(MU_HIGH, NOW).score).toBeCloseTo(0.375607, 3);
    expect(scoreTask(MU_HIGH, NOW).score).toBeGreaterThan(scoreTask(MU_LOW, NOW).score);
  });
});

// ── Ranking with the soft overdue boost ─────────────────────────────────────
describe("rankTasks — soft overdue boost", () => {
  it("ranks the core set: overdue TC3 floats to the top via boost", () => {
    const order = rankTasks([TC1, TC2, TC3, TC4, TC5a, TC5b], NOW).map((r) =>
      r.task === TC1 ? "TC1" : r.task === TC2 ? "TC2" : r.task === TC3 ? "TC3"
        : r.task === TC4 ? "TC4" : r.task === TC5a ? "TC5a" : "TC5b"
    );
    expect(order).toEqual(["TC3", "TC4", "TC5b", "TC1", "TC5a", "TC2"]);
  });

  it("overdue adds +OVERDUE_BOOST to rankValue; score itself stays in [0,1]", () => {
    const r = rankTasks([TC3], NOW)[0];
    expect(r.score).toBeCloseTo(0.503866, 3); // unchanged base score
    expect(r.rankValue).toBeCloseTo(0.903866, 3); // +0.4 boost
    expect(r.isOverdue).toBe(true);
  });

  it("SOFT: a critical non-overdue task now BEATS a trivial overdue one", () => {
    const odTrivial: ScorableTask = { effortMin: 15, importance: 1, cogLoad: 1, deadline: inHours(-2) };
    const nodCritical: ScorableTask = { effortMin: 120, importance: 4, cogLoad: 3, deadline: inHours(1) };
    // trivial overdue: 0.275389 + 0.4 = 0.675389  vs  critical non-overdue: 0.873429
    const ranked = rankTasks([odTrivial, nodCritical], NOW);
    expect(ranked[0].task).toBe(nodCritical);
    expect(ranked[0].rankValue).toBeCloseTo(0.873429, 3);
    expect(ranked[1].task).toBe(odTrivial);
    expect(ranked[1].rankValue).toBeCloseTo(0.675389, 3);
  });

  it("but a mid-importance overdue task still beats a comparable critical non-overdue task", () => {
    // TC3 overdue rankValue 0.903866  >  TC4 non-overdue 0.859727
    expect(rankTasks([TC4, TC3], NOW)[0].task).toBe(TC3);
  });

  it("isOverdue is true iff deadline is in the past", () => {
    expect(isOverdue(TC3, NOW)).toBe(true);
    expect(isOverdue(TC4, NOW)).toBe(false);
    expect(isOverdue(TC1, NOW)).toBe(false); // no deadline
  });
});

// ── Urgency curve properties ────────────────────────────────────────────────
describe("urgency curve", () => {
  it("no deadline → urgency 0", () => {
    expect(scoreTask({ effortMin: 90, importance: 4, cogLoad: 3 }, NOW).urgency).toBe(0);
  });
  it("monotonically non-decreasing as the deadline approaches", () => {
    let prev = -1;
    for (const off of [24, 12, 8, 5, 3, 2, 1.06, 0.75, 0.5, 0.25]) {
      const u = scoreTask({ effortMin: 60, importance: 1, cogLoad: 1, deadline: inHours(off) }, NOW).urgency;
      expect(u).toBeGreaterThanOrEqual(prev);
      prev = u;
    }
  });
  it("smooth across slack=0 (no discontinuity / hard override)", () => {
    const safe = scoreTask({ effortMin: 60, importance: 1, cogLoad: 1, deadline: inHours(1.07) }, NOW);
    const risk = scoreTask({ effortMin: 60, importance: 1, cogLoad: 1, deadline: inHours(1.05) }, NOW);
    expect(safe.isAtRisk).toBe(false);
    expect(risk.isAtRisk).toBe(true);
    expect(Math.abs(risk.urgency - safe.urgency)).toBeLessThan(0.05);
  });
  it("anchor: 60-min task, 2h to deadline → U≈0.2535", () => {
    expect(scoreTask({ effortMin: 60, importance: 1, cogLoad: 1, deadline: inHours(2) }, NOW).urgency)
      .toBeCloseTo(0.253506, 3);
  });
});

// ── Continuous risk buffer ──────────────────────────────────────────────────
describe("continuous risk buffer", () => {
  it("grows with effort, capped, no step", () => {
    expect(bufferFactor(10)).toBeCloseTo(1.01, 3);
    expect(bufferFactor(60)).toBeCloseTo(1.06, 3);
    expect(bufferFactor(240)).toBeCloseTo(1.24, 3);
    expect(bufferFactor(480)).toBeCloseTo(1.48, 3);
    expect(bufferFactor(1200)).toBeCloseTo(1.5, 3);
  });
  it("continuous around the old 60-min threshold (no cliff)", () => {
    expect(Math.abs(bufferFactor(61) - bufferFactor(59))).toBeLessThan(0.005);
  });
});
