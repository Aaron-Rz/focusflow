/**
 * Supabase ↔ Dexie sync — last-write-wins on updated_at.
 *
 * Strategy:
 *  1. Pull all Supabase rows for the user.
 *  2. For each remote row, if newer than local (or local missing) → update Dexie.
 *  3. For each local row, if newer than remote (or remote missing) → upsert to Supabase.
 *
 * Per-write sync: after every Dexie write, call the relevant syncUpsert* helper.
 * It fires-and-forgets; errors are surfaced via syncStore.setError.
 */

import { createClient } from '@/lib/supabase';
import { db, type Deletion } from '@/lib/db/dexie';
import { useSyncStore } from '@/stores/syncStore';
import type { Task, Workblock, TimerSession, Habit } from '@/types';

const LAST_USER_KEY = 'ff-last-synced-user';

interface SbDeletion {
  id: string; user_id: string; entity: Deletion['entity']; deleted_at: string;
}

/**
 * Wipe all local user data. Called on logout and on detecting an account switch,
 * so one user's data can never leak into another account's Supabase rows.
 */
export async function clearLocalData(): Promise<void> {
  await Promise.all([
    db.tasks.clear(),
    db.workblocks.clear(),
    db.timerSessions.clear(),
    db.habits.clear(),
    db.deletions.clear(),
  ]);
  try { localStorage.removeItem(LAST_USER_KEY); } catch {}
}

// ─── row types (Supabase snake_case) ─────────────────────────────────────────

interface SbTask {
  id: string; user_id: string; title: string; effort_min: number;
  importance: number; cog_load: number; deadline: string | null;
  category: string | null; parent_id: string | null; depends_on_id: string | null;
  status: string; created_at: string; completed_at: string | null; updated_at: string;
}

interface SbWorkblock {
  id: string; user_id: string; start: string; end: string;
  on_overrun: string; task_ids: string[]; category_filter: string[] | null;
  pomodoro_enabled: boolean | null; pomodoro_work_min: number | null;
  pomodoro_break_min: number | null; updated_at: string;
}

interface SbTimerSession {
  id: string; user_id: string; task_id: string; started_at: string;
  ended_at: string | null; paused_ms: number; updated_at: string;
}

interface SbHabit {
  id: string; user_id: string; title: string; frequency: string;
  custom_days: number[] | null; target_time: string | null;
  completion_log: string[]; created_at: string; updated_at: string;
}

// ─── mappers ─────────────────────────────────────────────────────────────────

function taskToSb(t: Task, userId: string): SbTask {
  return {
    id: t.id, user_id: userId, title: t.title,
    effort_min: t.effortMin, importance: t.importance, cog_load: t.cogLoad,
    deadline: t.deadline ?? null, category: t.category ?? null,
    parent_id: t.parentId ?? null, depends_on_id: t.dependsOnId ?? null,
    status: t.status, created_at: t.createdAt,
    completed_at: t.completedAt ?? null, updated_at: t.updatedAt,
  };
}

function sbToTask(r: SbTask): Task {
  return {
    id: r.id, title: r.title,
    effortMin: r.effort_min,
    importance: r.importance as Task['importance'],
    cogLoad: r.cog_load as Task['cogLoad'],
    deadline: r.deadline ?? undefined, category: r.category ?? undefined,
    parentId: r.parent_id ?? undefined, dependsOnId: r.depends_on_id ?? undefined,
    status: r.status as Task['status'],
    createdAt: r.created_at, completedAt: r.completed_at ?? undefined,
    updatedAt: r.updated_at,
  };
}

function workblockToSb(w: Workblock, userId: string): SbWorkblock {
  return {
    id: w.id, user_id: userId, start: w.start, end: w.end,
    on_overrun: w.onOverrun, task_ids: w.taskIds,
    category_filter: w.categoryFilter ?? null,
    pomodoro_enabled: w.pomodoroEnabled ?? null,
    pomodoro_work_min: w.pomodoroWorkMin ?? null,
    pomodoro_break_min: w.pomodoroBreakMin ?? null,
    updated_at: w.updatedAt,
  };
}

function sbToWorkblock(r: SbWorkblock): Workblock {
  return {
    id: r.id, start: r.start, end: r.end,
    onOverrun: r.on_overrun as Workblock['onOverrun'],
    taskIds: r.task_ids ?? [],
    categoryFilter: r.category_filter ?? undefined,
    pomodoroEnabled: r.pomodoro_enabled ?? undefined,
    pomodoroWorkMin: r.pomodoro_work_min ?? undefined,
    pomodoroBreakMin: r.pomodoro_break_min ?? undefined,
    updatedAt: r.updated_at,
  };
}

function timerToSb(s: TimerSession, userId: string): SbTimerSession {
  return {
    id: s.id, user_id: userId, task_id: s.taskId,
    started_at: s.startedAt, ended_at: s.endedAt ?? null,
    paused_ms: s.pausedMs, updated_at: s.updatedAt,
  };
}

function sbToTimer(r: SbTimerSession): TimerSession {
  return {
    id: r.id, taskId: r.task_id, startedAt: r.started_at,
    endedAt: r.ended_at ?? undefined, pausedMs: r.paused_ms,
    updatedAt: r.updated_at,
  };
}

function habitToSb(h: Habit, userId: string): SbHabit {
  return {
    id: h.id, user_id: userId, title: h.title, frequency: h.frequency,
    custom_days: h.customDays ?? null, target_time: h.targetTime ?? null,
    completion_log: h.completionLog, created_at: h.createdAt, updated_at: h.updatedAt,
  };
}

function sbToHabit(r: SbHabit): Habit {
  return {
    id: r.id, title: r.title,
    frequency: r.frequency as Habit['frequency'],
    customDays: r.custom_days ?? undefined,
    targetTime: r.target_time ?? undefined,
    completionLog: r.completion_log ?? [],
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function newer(a: string | undefined, b: string | undefined): boolean {
  // a is newer than b; treat missing as epoch
  return (a ?? '0') > (b ?? '0');
}

function reportError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  useSyncStore.getState().setError(`Sync error: ${msg}`);
}

// ─── full bidirectional sync ─────────────────────────────────────────────────

export async function syncAll(userId: string): Promise<void> {
  const { setSyncing, setLastSyncedAt, setError } = useSyncStore.getState();
  setSyncing(true);
  setError(null);

  try {
    // ── Account-switch guard ───────────────────────────────────────────────
    // If a DIFFERENT user previously synced on this device, wipe local data
    // before merging so account A's rows are never uploaded into account B.
    // A null previous user (fresh install / anonymous offline use) is NOT
    // wiped — that local data is merged up on first sign-in by design.
    let prevUser: string | null = null;
    try { prevUser = localStorage.getItem(LAST_USER_KEY); } catch {}
    if (prevUser && prevUser !== userId) {
      await clearLocalData();
    }

    const supabase = createClient();

    // Apply remote tombstones first so we don't re-upload rows deleted elsewhere.
    await applyRemoteDeletions(supabase, userId);

    // Snapshot tombstoned ids (after applying remote ones) so no table sync
    // re-uploads a row that has been deleted on any device.
    const tombstoned = await tombstonedIds();

    await Promise.all([
      syncTable_tasks(supabase, userId, tombstoned),
      syncTable_workblocks(supabase, userId, tombstoned),
      syncTable_timerSessions(supabase, userId, tombstoned),
      syncTable_habits(supabase, userId, tombstoned),
    ]);

    // Push any local tombstones the server hasn't seen yet.
    await pushLocalDeletions(supabase, userId);

    try { localStorage.setItem(LAST_USER_KEY, userId); } catch {}
    setLastSyncedAt(new Date().toISOString());
  } catch (e) {
    reportError(e);
  } finally {
    setSyncing(false);
  }
}

/** Pull remote tombstones → delete those rows locally and record the tombstone. */
async function applyRemoteDeletions(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('deletions').select('*').eq('user_id', userId);
  if (error) throw error;

  for (const r of (data as SbDeletion[]) ?? []) {
    await db.deletions.put({ id: r.id, entity: r.entity, deletedAt: r.deleted_at });
    switch (r.entity) {
      case 'tasks':          await db.tasks.delete(r.id); break;
      case 'workblocks':     await db.workblocks.delete(r.id); break;
      case 'timer_sessions': await db.timerSessions.delete(r.id); break;
      case 'habits':         await db.habits.delete(r.id); break;
    }
  }
}

/** Push local tombstones the server hasn't seen, and hard-delete those remote rows. */
async function pushLocalDeletions(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  const local = await db.deletions.toArray();
  if (!local.length) return;

  const { data: remote, error } = await supabase
    .from('deletions').select('id').eq('user_id', userId);
  if (error) throw error;
  const remoteIds = new Set((remote as { id: string }[]).map((d) => d.id));

  const missing = local.filter((d) => !remoteIds.has(d.id));
  if (!missing.length) return;

  const { error: upErr } = await supabase.from('deletions').upsert(
    missing.map((d) => ({ id: d.id, user_id: userId, entity: d.entity, deleted_at: d.deletedAt })),
  );
  if (upErr) throw upErr;

  // Hard-delete the corresponding rows remotely, grouped by entity.
  for (const entity of ['tasks', 'workblocks', 'timer_sessions', 'habits'] as const) {
    const ids = missing.filter((d) => d.entity === entity).map((d) => d.id);
    if (ids.length) {
      const { error: delErr } = await supabase
        .from(entity).delete().in('id', ids).eq('user_id', userId);
      if (delErr) throw delErr;
    }
  }
}

/** Set of ids that have a local tombstone — skip these when uploading. */
async function tombstonedIds(): Promise<Set<string>> {
  const all = await db.deletions.toArray();
  return new Set(all.map((d) => d.id));
}

// ─── per-table sync ───────────────────────────────────────────────────────────

async function syncTable_tasks(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tombstoned: Set<string>,
): Promise<void> {
  const { data: remoteRows, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;

  const remoteMap = new Map((remoteRows as SbTask[]).map((r) => [r.id, r]));
  const localRows = await db.tasks.toArray();
  const localMap = new Map(localRows.map((t) => [t.id, t]));

  // Remote → local: upsert into Dexie if remote is newer (skip tombstoned)
  for (const r of remoteRows as SbTask[]) {
    if (tombstoned.has(r.id)) continue;
    const local = localMap.get(r.id);
    if (!local || newer(r.updated_at, local.updatedAt)) {
      await db.tasks.put(sbToTask(r));
    }
  }

  // Local → remote: upsert if local is newer or remote missing (skip tombstoned)
  const toUpsert: SbTask[] = [];
  for (const t of localRows) {
    if (tombstoned.has(t.id)) continue;
    const remote = remoteMap.get(t.id);
    if (!remote || newer(t.updatedAt, remote.updated_at)) {
      toUpsert.push(taskToSb(t, userId));
    }
  }
  if (toUpsert.length) {
    const { error: uErr } = await supabase.from('tasks').upsert(toUpsert);
    if (uErr) throw uErr;
  }
}

async function syncTable_workblocks(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tombstoned: Set<string>,
): Promise<void> {
  const { data: remoteRows, error } = await supabase
    .from('workblocks')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;

  const remoteMap = new Map((remoteRows as SbWorkblock[]).map((r) => [r.id, r]));
  const localRows = await db.workblocks.toArray();
  const localMap = new Map(localRows.map((w) => [w.id, w]));

  for (const r of remoteRows as SbWorkblock[]) {
    if (tombstoned.has(r.id)) continue;
    const local = localMap.get(r.id);
    if (!local || newer(r.updated_at, local.updatedAt)) {
      await db.workblocks.put(sbToWorkblock(r));
    }
  }

  const toUpsert: SbWorkblock[] = [];
  for (const w of localRows) {
    if (tombstoned.has(w.id)) continue;
    const remote = remoteMap.get(w.id);
    if (!remote || newer(w.updatedAt, remote.updated_at)) {
      toUpsert.push(workblockToSb(w, userId));
    }
  }
  if (toUpsert.length) {
    const { error: uErr } = await supabase.from('workblocks').upsert(toUpsert);
    if (uErr) throw uErr;
  }
}

async function syncTable_timerSessions(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tombstoned: Set<string>,
): Promise<void> {
  const { data: remoteRows, error } = await supabase
    .from('timer_sessions')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;

  const remoteMap = new Map((remoteRows as SbTimerSession[]).map((r) => [r.id, r]));
  const localRows = await db.timerSessions.toArray();
  const localMap = new Map(localRows.map((s) => [s.id, s]));

  for (const r of remoteRows as SbTimerSession[]) {
    if (tombstoned.has(r.id)) continue;
    const local = localMap.get(r.id);
    if (!local || newer(r.updated_at, local.updatedAt)) {
      await db.timerSessions.put(sbToTimer(r));
    }
  }

  const toUpsert: SbTimerSession[] = [];
  for (const s of localRows) {
    if (tombstoned.has(s.id)) continue;
    const remote = remoteMap.get(s.id);
    if (!remote || newer(s.updatedAt, remote.updated_at)) {
      toUpsert.push(timerToSb(s, userId));
    }
  }
  if (toUpsert.length) {
    const { error: uErr } = await supabase.from('timer_sessions').upsert(toUpsert);
    if (uErr) throw uErr;
  }
}

async function syncTable_habits(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tombstoned: Set<string>,
): Promise<void> {
  const { data: remoteRows, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;

  const remoteMap = new Map((remoteRows as SbHabit[]).map((r) => [r.id, r]));
  const localRows = await db.habits.toArray();
  const localMap = new Map(localRows.map((h) => [h.id, h]));

  for (const r of remoteRows as SbHabit[]) {
    if (tombstoned.has(r.id)) continue;
    const local = localMap.get(r.id);
    if (!local || newer(r.updated_at, local.updatedAt)) {
      await db.habits.put(sbToHabit(r));
    }
  }

  const toUpsert: SbHabit[] = [];
  for (const h of localRows) {
    if (tombstoned.has(h.id)) continue;
    const remote = remoteMap.get(h.id);
    if (!remote || newer(h.updatedAt, remote.updated_at)) {
      toUpsert.push(habitToSb(h, userId));
    }
  }
  if (toUpsert.length) {
    const { error: uErr } = await supabase.from('habits').upsert(toUpsert);
    if (uErr) throw uErr;
  }
}

// ─── per-write helpers (fire-and-forget) ─────────────────────────────────────

export async function syncUpsertTask(task: Task): Promise<void> {
  const { userId } = useSyncStore.getState();
  if (!userId) return;
  try {
    const { error } = await createClient()
      .from('tasks')
      .upsert(taskToSb(task, userId));
    if (error) throw error;
  } catch (e) { reportError(e); }
}

export async function syncUpsertWorkblock(wb: Workblock): Promise<void> {
  const { userId } = useSyncStore.getState();
  if (!userId) return;
  try {
    const { error } = await createClient()
      .from('workblocks')
      .upsert(workblockToSb(wb, userId));
    if (error) throw error;
  } catch (e) { reportError(e); }
}

export async function syncUpsertTimerSession(s: TimerSession): Promise<void> {
  const { userId } = useSyncStore.getState();
  if (!userId) return;
  try {
    const { error } = await createClient()
      .from('timer_sessions')
      .upsert(timerToSb(s, userId));
    if (error) throw error;
  } catch (e) { reportError(e); }
}

export async function syncUpsertHabit(h: Habit): Promise<void> {
  const { userId } = useSyncStore.getState();
  if (!userId) return;
  try {
    const { error } = await createClient()
      .from('habits')
      .upsert(habitToSb(h, userId));
    if (error) throw error;
  } catch (e) { reportError(e); }
}

/**
 * Record a deletion as a local tombstone, then (if logged in) propagate it:
 * push the tombstone to Supabase and hard-delete the remote row. The local
 * tombstone is written unconditionally so an offline delete still propagates
 * on the next syncAll. Stores call this AFTER their local db.<table>.delete().
 */
async function recordAndSyncDelete(entity: Deletion['entity'], id: string): Promise<void> {
  const deletedAt = new Date().toISOString();
  // Always persist the tombstone locally (survives offline / failed sync).
  await db.deletions.put({ id, entity, deletedAt });

  const { userId } = useSyncStore.getState();
  if (!userId) return;
  try {
    const supabase = createClient();
    const { error: dErr } = await supabase
      .from('deletions')
      .upsert({ id, user_id: userId, entity, deleted_at: deletedAt });
    if (dErr) throw dErr;
    const { error } = await supabase
      .from(entity).delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
  } catch (e) { reportError(e); }
}

export function syncDeleteTask(id: string): Promise<void> {
  return recordAndSyncDelete('tasks', id);
}

export function syncDeleteWorkblock(id: string): Promise<void> {
  return recordAndSyncDelete('workblocks', id);
}

export function syncDeleteHabit(id: string): Promise<void> {
  return recordAndSyncDelete('habits', id);
}

/** Delete a timer session everywhere (tombstoned). */
export function syncDeleteTimerSession(id: string): Promise<void> {
  return recordAndSyncDelete('timer_sessions', id);
}
