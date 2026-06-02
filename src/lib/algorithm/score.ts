// score.ts — pure prioritization scoring + ranking (no I/O, `now` injected → testable).
// Canonical reference implementation. All tunables live in CONFIG.
//
// Scientific grounding (see CLAUDE_PROJECT_SPEC.md §13):
//  - Importance gates urgency (multiplicative coupling): adapted from the Apparent Tardiness
//    Cost rule (Vepsalainen & Morton 1987, Management Science 33(8)) and motivated by the
//    "mere urgency effect" (Zhu, Yang & Hsee 2018, J. Consumer Research 45(3)) — i.e. do NOT
//    let a deadline alone push a trivial task to the top.
//  - Continuous risk buffer growing with effort: planning fallacy (Buehler, Griffin & Ross
//    1994, JPSP). Underestimation appears only for tasks >~8 min, hence ~0 for quick tasks.
//  - Effort is kept ADDITIVE ("long tasks first") as a deliberate psychological choice
//    (eat-the-frog / risk). NOTE: this is the OPPOSITE of what minimizes weighted tardiness
//    (ATC/WSPT favour short tasks). Documented departure, not an oversight.

export type Importance = 1 | 2 | 3 | 4; // 4 = highest
export type CogLoad = 1 | 2 | 3; // 3 = highest mental load

export interface ScorableTask {
  effortMin: number; // estimated effort in minutes
  importance: Importance;
  cogLoad: CogLoad;
  deadline?: string; // ISO datetime; optional. May be an inherited "effective" deadline.
}

export interface ScoreResult {
  score: number; // final rank score in [0, 1]
  urgency: number; // U component in [0, 1]
  effortPriority: number; // EP component in [0, 1]
  importanceGate: number; // multiplier applied to urgency (in [floor, 1])
  isAtRisk: boolean; // cannot finish in time (slack <= 0) or overdue
}

export interface RankedTask<T extends ScorableTask = ScorableTask> extends ScoreResult {
  task: T;
  isOverdue: boolean; // deadline strictly in the past
  latenessHours: number; // how overdue (>0) ; -Infinity if no deadline
  rankValue: number; // score + overdue boost; the value actually sorted on
}

export const CONFIG = {
  WEIGHTS: { urgency: 0.5, effort: 0.25, importance: 0.2, cogLoad: 0.05 },
  QUICK_TASK_MIN: 10, // effort baseline = 0 below this (minutes); ~planning-fallacy floor
  BUFFER_SLOPE_PER_HOUR: 0.06, // continuous risk buffer: +6%/h of effort ...
  BUFFER_MAX: 0.5, // ... capped at +50% (interruption / fragmentation risk)
  K_URGENCY: 4.0, // steepness of the logistic urgency curve
  RATIO_MID: 0.8, // effort/remaining-time ratio at which urgency = 0.5
  EFFORT_REF_HOURS: 8, // an 8h task ≈ max effort-baseline score
  URGENCY_IMPORTANCE_FLOOR: 0.5, // a: urgency weight for a 0-importance task. a=1 → pure additive (legacy).
  OVERDUE_BOOST: 0.4, // additive rank boost for overdue tasks (soft; a critical non-overdue task can still win)
} as const;

type Config = typeof CONFIG;

const IMP_MAP: Record<Importance, number> = { 1: 0, 2: 1 / 3, 3: 2 / 3, 4: 1 };
const CL_MAP: Record<CogLoad, number> = { 1: 0, 2: 0.5, 3: 1 };
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Continuous risk buffer factor (>= 1), growing with effort and capped. */
export function bufferFactor(effortMin: number, cfg: Config = CONFIG): number {
  const E_h = effortMin / 60;
  return 1 + Math.min(cfg.BUFFER_SLOPE_PER_HOUR * E_h, cfg.BUFFER_MAX);
}

/**
 * Pure scoring function. `now` is injected → deterministic & testable.
 * `deadline` may already be an inherited "effective" deadline from dependency propagation.
 */
export function scoreTask(t: ScorableTask, now: Date, cfg: Config = CONFIG): ScoreResult {
  const W = cfg.WEIGHTS;
  const E_h = t.effortMin / 60;
  const E_eff_h = E_h * bufferFactor(t.effortMin, cfg);

  let urgency = 0;
  let isAtRisk = false;
  if (t.deadline) {
    const T_rem_h = (new Date(t.deadline).getTime() - now.getTime()) / 3.6e6;
    if (T_rem_h <= 0) {
      urgency = 1; // overdue
      isAtRisk = true;
    } else {
      const ratio = E_eff_h / T_rem_h; // may exceed 1 when overcommitted
      urgency = 1 / (1 + Math.exp(-cfg.K_URGENCY * (ratio - cfg.RATIO_MID)));
      isAtRisk = T_rem_h - E_eff_h <= 0; // flag only — no score discontinuity
    }
  }

  const effortPriority =
    t.effortMin < cfg.QUICK_TASK_MIN
      ? 0
      : clamp(Math.log(1 + E_h) / Math.log(1 + cfg.EFFORT_REF_HOURS), 0, 1);

  const imp = IMP_MAP[t.importance];
  // Importance gates urgency (ATC-style coupling). a = floor for 0-importance tasks.
  const importanceGate =
    cfg.URGENCY_IMPORTANCE_FLOOR + (1 - cfg.URGENCY_IMPORTANCE_FLOOR) * imp;

  const score =
    W.urgency * urgency * importanceGate +
    W.effort * effortPriority +
    W.importance * imp +
    W.cogLoad * CL_MAP[t.cogLoad];

  return { score, urgency, effortPriority, importanceGate, isAtRisk };
}

export function isOverdue(t: ScorableTask, now: Date): boolean {
  return !!t.deadline && new Date(t.deadline).getTime() <= now.getTime();
}

/**
 * Rank tasks. Overdue tasks get an additive `OVERDUE_BOOST` to their rank value (soft):
 * they generally float to the top, but a sufficiently critical non-overdue task can still
 * outrank a low-priority overdue one. Score itself stays in [0,1]; only rankValue carries the boost.
 *   rankValue = score + (isOverdue ? OVERDUE_BOOST : 0)
 * Tiebreak: more overdue / closer to deadline first.
 * NOTE: pass only *ready* tasks (dependency predecessors done) — see SPEC §7.
 */
export function rankTasks<T extends ScorableTask>(
  tasks: T[],
  now: Date,
  cfg: Config = CONFIG
): RankedTask<T>[] {
  const scored: RankedTask<T>[] = tasks.map((t) => {
    const s = scoreTask(t, now, cfg);
    const overdue = isOverdue(t, now);
    const latenessHours = t.deadline
      ? (now.getTime() - new Date(t.deadline).getTime()) / 3.6e6
      : -Infinity;
    const rankValue = s.score + (overdue ? cfg.OVERDUE_BOOST : 0);
    return { task: t, ...s, isOverdue: overdue, latenessHours, rankValue };
  });
  scored.sort((a, b) => {
    if (b.rankValue !== a.rankValue) return b.rankValue - a.rankValue;
    return b.latenessHours - a.latenessHours; // tiebreak: more overdue / nearer deadline
  });
  return scored;
}
