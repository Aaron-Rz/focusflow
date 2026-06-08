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
import { db } from '@/lib/db/dexie';
import { useSyncStore } from '@/stores/syncStore';
import type { Task, Workblock, TimerSession, Habit } from '@/types';

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
    const supabase = createClient();
    await Promise.all([
      syncTable_tasks(supabase, userId),
      syncTable_workblocks(supabase, userId),
      syncTable_timerSessions(supabase, userId),
      syncTable_habits(supabase, userId),
    ]);
    setLastSyncedAt(new Date().toISOString());
  } catch (e) {
    reportError(e);
  } finally {
    setSyncing(false);
  }
}

// ─── per-table sync ───────────────────────────────────────────────────────────

async function syncTable_tasks(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  const { data: remoteRows, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;

  const remoteMap = new Map((remoteRows as SbTask[]).map((r) => [r.id, r]));
  const localRows = await db.tasks.toArray();
  const localMap = new Map(localRows.map((t) => [t.id, t]));

  // Remote → local: upsert into Dexie if remote is newer
  for (const r of remoteRows as SbTask[]) {
    const local = localMap.get(r.id);
    if (!local || newer(r.updated_at, local.updatedAt)) {
      await db.tasks.put(sbToTask(r));
    }
  }

  // Local → remote: upsert to Supabase if local is newer or remote missing
  const toUpsert: SbTask[] = [];
  for (const t of localRows) {
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
    const local = localMap.get(r.id);
    if (!local || newer(r.updated_at, local.updatedAt)) {
      await db.workblocks.put(sbToWorkblock(r));
    }
  }

  const toUpsert: SbWorkblock[] = [];
  for (const w of localRows) {
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
    const local = localMap.get(r.id);
    if (!local || newer(r.updated_at, local.updatedAt)) {
      await db.timerSessions.put(sbToTimer(r));
    }
  }

  const toUpsert: SbTimerSession[] = [];
  for (const s of localRows) {
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
    const local = localMap.get(r.id);
    if (!local || newer(r.updated_at, local.updatedAt)) {
      await db.habits.put(sbToHabit(r));
    }
  }

  const toUpsert: SbHabit[] = [];
  for (const h of localRows) {
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

export async function syncDeleteTask(id: string): Promise<void> {
  const { userId } = useSyncStore.getState();
  if (!userId) return;
  try {
    const { error } = await createClient()
      .from('tasks').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
  } catch (e) { reportError(e); }
}

export async function syncDeleteWorkblock(id: string): Promise<void> {
  const { userId } = useSyncStore.getState();
  if (!userId) return;
  try {
    const { error } = await createClient()
      .from('workblocks').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
  } catch (e) { reportError(e); }
}

export async function syncDeleteHabit(id: string): Promise<void> {
  const { userId } = useSyncStore.getState();
  if (!userId) return;
  try {
    const { error } = await createClient()
      .from('habits').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
  } catch (e) { reportError(e); }
}
