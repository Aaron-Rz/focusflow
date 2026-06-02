# Project Spec — `<APP_NAME>` Personal Time-Management & Task-Prioritization App

> Instruction file for Claude Code. This file is the single source of truth for scope, data
> model, and the prioritization algorithm. Do **not** add features marked "Out of scope".
> When unsure, ask before coding.

## 0. How to use this file (READ FIRST)

**Current state of this folder:** it contains exactly three files: this `CLAUDE.md`,
`score.ts`, and `score.test.ts`. The Next.js project does **not** exist yet — you scaffold it.

**Pick a name:** replace every `<APP_NAME>` placeholder with a real project name (ask the user
once if not given; default to `focusflow`).

### Bootstrap (run once, then never again)
Run each step in the integrated terminal. Stop and report if any step fails.

1. **Move the seed files aside** so the scaffolder sees an empty folder:
   create a folder `_seed/` and move `score.ts` and `score.test.ts` into it.
   (`create-next-app` refuses to run in a folder that contains non-allowlisted files.)
2. **Scaffold Next.js** in the current folder:
   `npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir --no-import-alias --use-npm --yes`
   If it still complains about `CLAUDE.md`, temporarily move `CLAUDE.md` into `_seed/` too, scaffold, then move it back to the project root.
3. **Install dependencies:**
   `npm install dexie zustand` and `npm install -D vitest @vitest/ui`
4. **Place the algorithm files:** create `src/lib/algorithm/` and move
   `_seed/score.ts` and `_seed/score.test.ts` into it. Then delete `_seed/`.
5. **Wire up testing:** add `"test": "vitest run"` to `package.json` scripts and create a
   minimal `vitest.config.ts` so `npx vitest run` runs TypeScript tests.
6. **Verify the foundation:** run `npx vitest run`. **All 20 tests in `score.test.ts` must
   pass before you write anything else.** If they fail, stop and report — do not "fix" them by
   editing `score.ts`/`score.test.ts` (see Invariants).
7. Initialise git: `git init && git add -A && git commit -m "chore: bootstrap + verified algorithm"`.

After bootstrap, proceed through the milestones in **§12, one at a time**, committing after each.

## Commands
- `npm run dev` — start the dev server
- `npx vitest run` — run the algorithm/unit tests (must stay green)
- `npm run build` — production build
- `npm run lint` — ESLint

## Invariants (never violate)
- **`score.ts` and `score.test.ts` are complete and verified — never modify them.** If a test
  fails, the bug is in *your* new code, not the algorithm. Report instead of editing them.
- **Build strictly in the §12 order, one milestone per request.** Do not jump ahead.
- **Respect §2 scope.** Do not build anything listed under "Out of scope (v2+)".
- **Algorithm code stays pure** (no I/O; `now` is injected) so it remains testable.
- All tunables live in `CONFIG` (§6.1) — never hard-code numbers in logic.
- Before implementing, briefly state your plan and wait for approval (use plan mode).

---

## 1. Purpose & context

A single-user (no multi-tenant, no public sign-up) productivity app that:
1. Stores tasks with effort, importance, cognitive load, and deadline.
2. Ranks tasks via a transparent, tunable scoring algorithm (Section 6).
3. Lets the user fill **workblocks** with tasks in ranked order, with a timer.
4. Tracks actuals for later analytics.

Primary device: **iPhone (installed PWA)**. Secondary: **Windows (browser)**.

---

## 2. Scope

### In scope — MVP / v1
- Task CRUD: effort (minutes), importance (1–4), cognitive load (1–3), optional deadline, category (free-text tag).
- Subtasks, **max depth 2** (parent → child → grandchild).
- **Must-Do dependencies** (DAG) with cycle detection and deadline propagation (Section 7).
- Prioritization algorithm with ranked list of *ready* tasks (Section 6).
- Internal **workblocks**: user defines start/end times manually; auto-filled with tasks in rank order.
- Workblock behaviour toggle: (a) abort task at block end, or (b) extend block until current task finishes.
- **Pomodoro timer** with customizable work/break lengths.
- **Per-task timer** (manual start/pause; auto-stop when task is checked off) → stores actual time spent.
- Local persistence (Dexie.js / IndexedDB) + **JSON export/import for backup** (mandatory, see Section 4).

### Out of scope — v2+ (do NOT build in v1)
- Cloud sync / auth (Supabase) — v2.
- Google Calendar bidirectional sync (OAuth) — v2.
- Apple Calendar sync — deferred (only `.ics` export ever).
- Task import from Notion / Excel / CSV — v2 (CSV first).
- Habit tracking — v2.
- Analytics dashboard — v2.
- Time-of-day placement of high-cognitive-load tasks — v2.
- Working-hours-aware deadline math — v2 (v1 uses wall-clock hours).

---

## 3. Tech stack (pinned)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | API routes reserved for v2 OAuth |
| State | **Zustand** | Keep it minimal |
| Local DB | **Dexie.js** (IndexedDB wrapper) | All v1 data lives here |
| Styling | Tailwind CSS | |
| PWA | `next-pwa` (manifest + service worker) | Installable, offline-first |
| Hosting | **Vercel** free tier | |
| Cloud (v2) | Supabase (Postgres + Auth + RLS) | Not in v1 |
| Calendar (v2) | Google Calendar API via Next.js API routes | Tokens stored server-side |
| Testing | Vitest (unit, esp. the algorithm) | The scoring function MUST be unit-tested |

---

## 4. Known platform constraints — READ FIRST

These are hard limitations of an iOS PWA. Do not promise behaviour that violates them.

- **No reliable background execution.** Pomodoro/per-task timers and notifications are unreliable when the app is closed/backgrounded on iOS. Implement timers as **wall-clock-based** (store `startedAt` timestamps and compute elapsed on resume) rather than relying on `setInterval` running in the background. Web Push exists only on iOS ≥ 16.4 for installed PWAs — treat notifications as best-effort, not guaranteed.
- **Storage can be evicted.** iOS may clear IndexedDB for an unused installed PWA (version-dependent). Therefore: **JSON export/import is a v1 requirement, not a nice-to-have**, and the app should prompt for a backup periodically. This is also the main reason cloud sync (v2) is high-priority.
- **No native calendar access.** Apple Calendar bidirectional sync is impossible from a PWA. Provide `.ics` export only. Google sync (v2) is fine via OAuth.

If iOS timer/notification limits prove unacceptable, the documented upgrade path is **React Native / Expo** (reuse the algorithm + data model unchanged).

---

## 5. Data model

TypeScript interfaces (source of truth). Store in Dexie tables: `tasks`, `workblocks`, `timerSessions`.

```ts
type Importance = 1 | 2 | 3 | 4;      // 4 = highest
type CogLoad = 1 | 2 | 3;             // 3 = highest mental load
type TaskStatus = 'open' | 'done';

interface Task {
  id: string;                 // uuid
  title: string;
  effortMin: number;          // estimated effort in minutes
  importance: Importance;
  cogLoad: CogLoad;
  deadline?: string;          // ISO datetime; optional
  category?: string;          // free-text tag for filtering
  parentId?: string;          // for subtasks; null = top-level. Max depth = 2.
  dependsOnId?: string;       // "Must-Do" predecessor. This task is BLOCKED until it is done.
  status: TaskStatus;
  createdAt: string;          // ISO
  completedAt?: string;       // ISO; set when checked off
  // computed at runtime, not stored:
  // score, urgency, isReady, isAtRisk, effectiveDeadline
}

interface Workblock {
  id: string;
  start: string;              // ISO datetime
  end: string;                // ISO datetime
  onOverrun: 'abortTask' | 'extendBlock';
  taskIds: string[];          // filled in rank order
}

interface TimerSession {
  id: string;
  taskId: string;
  startedAt: string;          // ISO
  endedAt?: string;           // ISO; null while running
  pausedMs: number;           // accumulated paused time
  // actual time spent = (endedAt - startedAt) - pausedMs
}
```

---

## 6. Prioritization algorithm — CORE

Goal ranking priority: **Deadline ≫ Effort ≳ Importance > Cognitive Load.**
Grounded in scheduling theory (Minimum-Slack / Critical-Ratio dispatching rules) and the
planning-fallacy literature. Implement as a **pure function** `scoreTask(task, now, ctx)`
that is fully unit-tested. All magic numbers live in a single `CONFIG` object.

### 6.1 Tunable constants (single config object)

```ts
const CONFIG = {
  WEIGHTS: { urgency: 0.50, effort: 0.25, importance: 0.20, cogLoad: 0.05 },
  QUICK_TASK_MIN: 10,            // tasks below this are excluded from the effort-baseline boost
  BUFFER_SLOPE_PER_HOUR: 0.06,   // continuous risk buffer: +6% per hour of effort ...
  BUFFER_MAX: 0.5,               // ... capped at +50% (interruption/fragmentation risk)
  K_URGENCY: 4.0,                // steepness of the logistic urgency curve
  RATIO_MID: 0.8,                // effort/remaining-time ratio at which urgency = 0.5
  EFFORT_REF_HOURS: 8,           // an 8h task ≈ max effort-baseline score
  URGENCY_IMPORTANCE_FLOOR: 0.5, // a: urgency weight for a 0-importance task. a=1 → legacy additive.
};
```

> These defaults are a **starting point**, not validated truth. They must be calibrated
> against the user's own behaviour once analytics (v2) exist.

### 6.2 Component scores (each normalized to [0, 1])

**1) Urgency `U`** (deadline-driven; dominant). Continuous **risk buffer** grows with
effort (interruption/fragmentation risk), then a **logistic** curve centered on the
slack-critical point. The curve is flat when there is comfortable slack, steep through the
critical zone, and saturates toward 1 when the task is overcommitted.
```
if (no deadline)            U = 0
else:
  E_h        = effortMin / 60
  buffer     = min(BUFFER_SLOPE_PER_HOUR * E_h, BUFFER_MAX)   // continuous, capped
  E_eff_h    = E_h * (1 + buffer)
  T_rem_h    = (deadline - now) in hours
  if (T_rem_h <= 0)         U = 1.0                            // overdue
  else:
    ratio = E_eff_h / T_rem_h                                 // may exceed 1
    U = 1 / (1 + exp(-K_URGENCY * (ratio - RATIO_MID)))       // logistic
```
`isAtRisk = (T_rem_h <= 0) || (T_rem_h - E_eff_h <= 0)` is a **UI flag only** — it does
**not** create a score discontinuity. Note the deliberate design choice: overdue/at-risk
tasks are surfaced via the flag and high urgency, but are **not** force-sorted above all
others; importance and effort still apply. (To force overdue to the top, add a one-line
override on `T_rem_h <= 0`.)

**2) Effort baseline `EP`** (long tasks generally rank higher; quick tasks excluded)
```
if (effortMin < QUICK_TASK_MIN)  EP = 0
else                             EP = clamp( log(1 + E_h) / log(1 + EFFORT_REF_HOURS), 0, 1 )
```

**3) Importance `IMP`**: linear, exact thirds: `{1,2,3,4} -> {0, 1/3, 2/3, 1}`.

**4) Cognitive load `CL`**: map `{1,2,3} -> {0, 0.5, 1.0}`.

### 6.3 Final score & ranking

**Importance gates urgency** (ATC-style coupling; counters the mere-urgency effect — see §13).
Let `a = URGENCY_IMPORTANCE_FLOOR` and `gate = a + (1 - a) * IMP`:
```
score = W.urgency * U * gate  +  W.effort * EP  +  W.importance * IMP  +  W.cogLoad * CL
```
- `a = 1` recovers the legacy pure-additive model (nothing lost; it's a special case).
- `a = 0.5` (default): a 0-importance task gets half urgency weight; a max-importance task full.

**Ranking = sort by `rankValue` descending**, where overdue tasks get a soft additive boost:
```
rankValue = score + (isOverdue ? OVERDUE_BOOST : 0)     // OVERDUE_BOOST = 0.4
```
- `score` stays in `[0,1]` (interpretable); only `rankValue` carries the boost.
- Tiebreak: more overdue / closer to deadline first.
- **Soft, not absolute:** overdue tasks generally float to the top, but a sufficiently
  critical *non-overdue* task can still outrank a low-priority overdue one (e.g. a trivial
  overdue task at `0.27 + 0.4 = 0.67` loses to a critical non-overdue task at `0.87`, while a
  mid-importance overdue task at `0.50 + 0.4 = 0.90` still wins). `OVERDUE_BOOST` is the knob:
  higher → closer to "overdue always on top"; lower → overdue competes purely on merit.

Only **ready** tasks (dependency predecessors done, §7) are passed to ranking.

### 6.4 Reference pseudocode

```ts
function scoreTask(t: Task, now: Date, cfg = CONFIG): ScoredTask {
  const W = cfg.WEIGHTS;
  const E_h = t.effortMin / 60;
  const buffer = Math.min(cfg.BUFFER_SLOPE_PER_HOUR * E_h, cfg.BUFFER_MAX);
  const E_eff_h = E_h * (1 + buffer);

  let U = 0, isAtRisk = false;
  const dl = effectiveDeadline(t);            // Section 7: may be inherited
  if (dl) {
    const T_rem_h = (dl.getTime() - now.getTime()) / 3.6e6;
    if (T_rem_h <= 0) {
      U = 1.0; isAtRisk = true;                // overdue
    } else {
      const ratio = E_eff_h / T_rem_h;         // may exceed 1
      U = 1 / (1 + Math.exp(-cfg.K_URGENCY * (ratio - cfg.RATIO_MID)));
      isAtRisk = (T_rem_h - E_eff_h) <= 0;     // flag only; no score jump
    }
  }

  const EP  = t.effortMin < cfg.QUICK_TASK_MIN
              ? 0
              : clamp(Math.log(1 + E_h) / Math.log(1 + cfg.EFFORT_REF_HOURS), 0, 1);
  const IMP = [0, 0, 1/3, 2/3, 1][t.importance];
  const CL  = [0, 0, 0.5, 1.0][t.cogLoad];
  const gate = cfg.URGENCY_IMPORTANCE_FLOOR + (1 - cfg.URGENCY_IMPORTANCE_FLOOR) * IMP;

  const score = W.urgency*U*gate + W.effort*EP + W.importance*IMP + W.cogLoad*CL;
  return { ...t, score, urgency: U, isAtRisk };
}
// Ranking: overdue tier first, then by score desc (tiebreak: more overdue first).
// See score.ts → rankTasks() for the canonical, tested implementation.
```

### 6.5 Required unit tests (minimum)
- No deadline → `U = 0`; ranking driven by effort + importance.
- Overdue (`T_rem ≤ 0`) → `U = 1`, `isAtRisk = true`.
- Quick task (<10 min) → `EP = 0`; only rises via urgency near deadline.
- At-risk flag set iff `slack ≤ 0`, **without** a score discontinuity (smooth across slack=0).
- Quick comfortable vs. quick at-risk: the at-risk one scores far higher (urgency rescue);
  the comfortable one does **not** dominate a larger important task (regression test).
- Monotonicity: decreasing `T_rem_h` never decreases `U`.
- See `score.test.ts` for the canonical worked numbers (verified).

---

## 7. Dependencies (Must-Do) & subtasks

### Dependencies (DAG)
- `task.dependsOnId` points to a **predecessor** that must be `done` first.
- A task is **ready** iff it has no predecessor or its predecessor is `done`.
- Only ready tasks enter the active ranked list. Blocked tasks render greyed-out, separately.
- **Cycle detection required**: reject creating/editing a dependency that introduces a cycle
  (DFS / topological check). Show a clear error.

### Deadline propagation (important)
A predecessor must finish before its successor can start. So the predecessor inherits a
**derived deadline**:
```
effectiveDeadline(pred) = min(
  pred.deadline ?? +Infinity,
  successor.effectiveDeadline - successor.E_eff      // must finish this early
)
```
Compute by walking the chain from successors back to predecessors. Without this, a
must-do predecessor of an urgent task would be ranked too late.

### Subtasks (max depth 2)
- Subtasks are ordinary `Task`s with `parentId`; they are scored by the same function.
- A "must-do" relationship between siblings is just a `dependsOnId` edge — reuse the DAG logic.
- Parent display rank = max(child scores) (UI rollup only; not stored).

---

## 8. Workblocks & scheduling

- User creates a workblock (start, end, `onOverrun`).
- Fill algorithm: take ready tasks in rank order; greedily assign until the block's remaining
  time `< nextTask.effortMin` (respecting `onOverrun`):
  - `abortTask`: stop the running task at block end; remaining effort stays on the task.
  - `extendBlock`: let the current task finish, then end the block.
- Provide `.ics` export of workblocks (no live calendar sync in v1).

---

## 9. Timer

- **Per-task timer**: manual start/pause; auto-stop on task completion. Persist as `TimerSession`
  (store timestamps, compute elapsed on resume — see Section 4, no background reliance).
- **Pomodoro**: customizable work/break durations; independent of per-task timer but can run together.

---

## 10. Architecture / folder structure

```
src/
  app/                  # Next.js routes (App Router)
  components/
  lib/
    algorithm/
      score.ts          # pure scoring fn + CONFIG
      score.test.ts
      dependencies.ts   # DAG: ready-check, cycle detection, deadline propagation
    db/
      dexie.ts          # schema + typed tables
      backup.ts         # JSON export/import
    scheduling/
      workblocks.ts
    timer/
  stores/               # Zustand
  types/                # shared TS interfaces (Section 5)
```

---

## 11. Coding conventions
- Strict TypeScript (`strict: true`). No `any`.
- Algorithm code must be **pure** (no I/O, no Date.now() inside — pass `now` in). This keeps it testable.
- All tunables in `CONFIG`; never hard-code numbers in logic.
- Keep v1 dependency-free where reasonable (algorithm = plain TS, no libraries).

---

## 12. Build order (milestones)
1. Data model + Dexie schema + JSON backup/restore.
2. Scoring function + full unit tests (Section 6.5). **Do this before any UI.**
3. Task CRUD UI + ranked list (ready tasks only).
4. Dependencies (DAG): ready-check, cycle detection, deadline propagation.
5. Subtasks (depth 2).
6. Workblocks + fill algorithm + `.ics` export.
7. Per-task timer + Pomodoro.
8. PWA polish (manifest, service worker, install prompt, backup reminder).

---

## 13. Rationale / references (verified)

Citations below were checked against the primary sources. Empirical vs. popular is labelled.

- **Apparent Tardiness Cost (ATC) rule** — Vepsalainen, A. P. J. & Morton, T. E. (1987),
  "Priority rules for job shops with weighted tardiness costs", *Management Science* 33(8),
  1035–1047. One of the best-performing construction heuristics for weighted tardiness;
  couples weight × an exponential slack discount. **Adapted here** as the importance-gating
  of urgency. *(Empirical / OR.)* Look-ahead parameter `k` ≈ 1.5–4.5 for small slack.
- **Mere-urgency effect** — Zhu, M., Yang, Y. & Hsee, C. K. (2018), "The Mere Urgency Effect",
  *Journal of Consumer Research* 45(3), 673–690. People over-pursue urgent-but-unimportant
  tasks even against objectively better payoffs → motivates `URGENCY_IMPORTANCE_FLOOR < 1`
  so a deadline alone can't dominate. *(Empirical.)*
- **Planning fallacy** — Buehler, R., Griffin, D. & Ross, M. (1994), *Journal of Personality
  and Social Psychology*; foundation Kahneman & Tversky (1979). Predicted 33.9 vs. actual
  55.5 days (≈ +64%); underestimation appears only for tasks ≳ 8 min. → continuous buffer
  growing with effort, ≈0 for quick tasks. *(Empirical.)*
- **Eat-the-Frog** (Tracy) & **Eisenhower matrix** — popular frameworks, **not peer-reviewed**.
  They informed intent (long/hard first; importance×urgency), not the math.

### Key tensions to keep in mind (design honesty)
1. **Long-first vs. tardiness-optimal.** ATC/WSPT minimise weighted tardiness/flow time by
   doing *short* high-value tasks first (WSPT = Smith 1956, provably optimal for Σwⱼ·Cⱼ; EDD =
   Jackson 1955 for Lₘₐₓ). The product deliberately does the opposite (effort is an additive
   *boost*). Defensible on **risk/robustness** (front-load high-variance long tasks to keep
   recovery buffer) and **state-dependent processing** (hard work when fresh), **not** on
   flow-time efficiency. The cost: a long task delays everything behind it — a short *important*
   task stuck behind a "frog" is the failure mode. The `effort` weight is the knob; consider a
   **mode toggle**: *Focus* (high effort weight, eat-the-frog) vs *Throughput* (low/zero effort
   weight, WSPT-like, clear short important tasks first).
2. **Overdue handling is now soft.** A `+OVERDUE_BOOST` (0.4) lifts overdue tasks but lets a
   genuinely critical non-overdue task compete, rather than forcing overdue strictly on top
   (which would be the mere-urgency effect maximised). Still encourage archive/snooze of stale
   overdue tasks so they don't accumulate.
3. **Buffer is likely too conservative.** Literature suggests 30–60% underestimation; the
   v1 buffer is smaller. Correct answer = **personalised reference-class forecasting**:
   learn each user's actual/estimate ratio from logged per-task timers (v2 analytics) and
   set the buffer from data instead of a constant.
