'use client';

import { useEffect, useState } from 'react';
import { useTaskStore } from '@/stores/taskStore';
import { useWorkblockStore } from '@/stores/workblockStore';
import { fillWorkblock, workblockToIcs } from '@/lib/scheduling/workblocks';
import type { Workblock, ScheduleSegment, Task } from '@/types';
import { downloadFile } from '@/lib/utils/download';
import { getDistinctCategories } from '@/lib/utils/categories';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';
import { isDueToday } from '@/lib/habits/schedule';

/* ─── Helpers ─── */

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--ff-dm-sans, sans-serif)',
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--t2)',
};

/* ─── Habit helpers ─── */

function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
}

/** Habit-tasks with a targetTime that fall within the workblock window and are due that day */
function getHabitSlotsForBlock(habitTasks: Task[], wb: Workblock): { task: Task; at: Date }[] {
  const wbStart = new Date(wb.start);
  const wbEnd = new Date(wb.end);
  const wbDay = startOfDay(wbStart);
  const slots: { task: Task; at: Date }[] = [];

  for (const t of habitTasks) {
    if (!t.targetTime) continue;
    if (!isDueToday(t, wbDay)) continue;
    const [hh, mm] = t.targetTime.split(':').map(Number);
    const at = new Date(wbDay);
    at.setHours(hh, mm, 0, 0);
    if (at >= wbStart && at < wbEnd) {
      slots.push({ task: t, at });
    }
  }
  return slots.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/* ─── HabitSlots component ─── */

function HabitSlots({ slots }: { slots: { task: Task; at: Date }[] }) {
  if (!slots.length) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'var(--t3)',
          marginBottom: 4,
        }}
      >
        Fixed habit slots
      </div>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {slots.map(({ task, at }, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 8px',
              borderRadius: 'var(--r)',
              background: 'var(--bg-2)',
              borderLeft: '2px solid var(--ok)',
            }}
          >
            <span
              className="tabular-nums"
              style={{ fontSize: 11, color: 'var(--t2)', flexShrink: 0, width: 100 }}
            >
              {fmtTime(at)} (fixed)
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ○ {task.title}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ─── Segment timeline ─── */

function SegmentList({ segments, taskMap }: { segments: ScheduleSegment[]; taskMap: Map<string, Task> }) {
  if (segments.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--t3)', fontStyle: 'italic', padding: '4px 0' }}>
        No ready tasks fit this block.
      </p>
    );
  }

  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {segments.map((seg, i) => {
        const isBreak = seg.type === 'break';
        const durMin = (seg.end.getTime() - seg.start.getTime()) / 60_000;
        const task = (!isBreak && seg.taskId) ? taskMap.get(seg.taskId) : undefined;

        return (
          <li
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 8px',
              borderRadius: 'var(--r)',
              background: isBreak ? 'transparent' : 'var(--bg-2)',
              borderLeft: isBreak
                ? '2px solid var(--border-2)'
                : '2px solid var(--accent)',
              opacity: isBreak ? 0.6 : 1,
            }}
          >
            <span
              className="tabular-nums"
              style={{
                fontSize: 11,
                color: 'var(--t2)',
                flexShrink: 0,
                width: 100,
              }}
            >
              {fmtTime(seg.start)}–{fmtTime(seg.end)}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 12,
                color: isBreak ? 'var(--t3)' : 'var(--t1)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {isBreak
                ? `break (${formatDuration(durMin)})`
                : task?.title ?? '(unknown)'
              }
              {!isBreak && seg.isContinuation && (
                <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 4 }}>(cont.)</span>
              )}
            </span>
            <span
              style={{ fontSize: 11, color: 'var(--t3)', flexShrink: 0 }}
              className="tabular-nums"
            >
              {formatDuration(Math.round(durMin))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ─── WorkblocksPage ─── */

export default function WorkblocksPage() {
  const { tasks, loading: tasksLoading, loadTasks } = useTaskStore();
  const { workblocks, loading: wbLoading, loadWorkblocks, addWorkblock, deleteWorkblock } =
    useWorkblockStore();

  const now = new Date();
  const roundedNow   = new Date(Math.ceil(now.getTime() / 60_000) * 60_000);
  const oneHourLater = new Date(roundedNow.getTime() + 60 * 60_000);

  const [showForm, setShowForm]         = useState(false);
  const [start, setStart]               = useState(toLocalDatetimeValue(roundedNow));
  const [end, setEnd]                   = useState(toLocalDatetimeValue(oneHourLater));
  const [onOverrun, setOnOverrun]       = useState<Workblock['onOverrun']>('abortTask');
  const [pomodoroEnabled, setPomodoroEnabled] = useState(false);
  const [pomodoroWorkMin, setPomodoroWorkMin] = useState(25);
  const [pomodoroBreakMin, setPomodoroBreakMin] = useState(5);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [includeHabits, setIncludeHabits]   = useState(false);
  const [formError, setFormError]       = useState('');
  const [submitting, setSubmitting]     = useState(false);

  useEffect(() => {
    loadTasks();
    loadWorkblocks();
  }, [loadTasks, loadWorkblocks]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const startDate = new Date(start);
    const endDate   = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setFormError('Invalid dates.');
      return;
    }
    if (endDate <= startDate) {
      setFormError('End must be after start.');
      return;
    }
    if (pomodoroEnabled && pomodoroWorkMin < 1) {
      setFormError('Work duration must be at least 1 minute.');
      return;
    }
    setSubmitting(true);
    await addWorkblock({
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      onOverrun,
      categoryFilter: categoryFilter.length > 0 ? categoryFilter : undefined,
      includeHabits: includeHabits || undefined,
      pomodoroEnabled,
      pomodoroWorkMin: pomodoroEnabled ? pomodoroWorkMin : undefined,
      pomodoroBreakMin: pomodoroEnabled ? pomodoroBreakMin : undefined,
    });
    setSubmitting(false);
    setShowForm(false);
  };

  const loading = tasksLoading || wbLoading;
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const cats    = getDistinctCategories(tasks);

  const fieldLabel: React.CSSProperties = {
    display: 'block', fontSize: 10, letterSpacing: '0.05em',
    textTransform: 'uppercase', color: 'var(--t2)', marginBottom: 4,
  };

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh' }}>

      {/* ── Sticky header ── */}
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 40,
          background: 'var(--bg-1)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            maxWidth: 640, margin: '0 auto',
            padding: '10px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'var(--ff-dm-sans, sans-serif)',
                fontWeight: 800, fontSize: 18,
                letterSpacing: '-0.02em', color: 'var(--t1)', lineHeight: 1,
              }}
            >
              Workblocks
            </h1>
            <p style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>
              {loading ? 'loading…' : `${workblocks.length} block${workblocks.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ThemeToggleButton />
            <button
              onClick={() => setShowForm((v) => !v)}
              style={{
                padding: '8px 14px',
                borderRadius: 'var(--r)',
                background: showForm ? 'var(--bg-3)' : 'var(--accent)',
                color: showForm ? 'var(--t1)' : 'var(--accent-text)',
                border: showForm ? '1px solid var(--border-2)' : 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                minHeight: 36,
                minWidth: 44,
                letterSpacing: '0.02em',
              }}
            >
              {showForm ? '× close' : '+ new'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Create form (collapsible) ── */}
      {showForm && (
        <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-1)' }}>
          <form
            onSubmit={handleCreate}
            style={{ maxWidth: 640, margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            {formError && (
              <div
                style={{
                  fontSize: 12, color: 'var(--error)',
                  background: 'rgba(192,48,48,0.08)',
                  border: '1px solid var(--error)',
                  borderRadius: 'var(--r)',
                  padding: '6px 10px',
                }}
              >
                {formError}
              </div>
            )}

            {/* Start / End */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label style={fieldLabel}>Start</label>
                <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required style={{ width: '100%' }} />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={fieldLabel}>End</label>
                <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required style={{ width: '100%' }} />
              </div>
            </div>

            {/* Overrun */}
            <div>
              <label style={fieldLabel}>On overrun</label>
              <select value={onOverrun} onChange={(e) => setOnOverrun(e.target.value as Workblock['onOverrun'])} style={{ width: '100%' }}>
                <option value="abortTask">Abort task at block end</option>
                <option value="extendBlock">Extend block until task finishes</option>
              </select>
            </div>

            {/* Category filter */}
            {cats.length > 0 && (
              <div>
                <label style={fieldLabel}>Include categories (empty = all)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 6px', marginBottom: categoryFilter.length > 0 ? 6 : 0 }}>
                  {cats.map((cat) => {
                    const active = categoryFilter.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() =>
                          setCategoryFilter(
                            active ? categoryFilter.filter((c) => c !== cat) : [...categoryFilter, cat]
                          )
                        }
                        style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: 'var(--r)',
                          border: '1px solid',
                          borderColor: active ? 'var(--accent)' : 'var(--border-2)',
                          background: active ? 'var(--accent-dim)' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--t2)',
                          cursor: 'pointer',
                          minHeight: 28,
                        }}
                      >
                        #{cat}
                      </button>
                    );
                  })}
                  {categoryFilter.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCategoryFilter([])}
                      style={{ fontSize: 11, color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      clear
                    </button>
                  )}
                </div>
                {categoryFilter.length > 0 && (
                  <p style={{ fontSize: 11, color: 'var(--accent)', margin: 0 }}>
                    Only: {categoryFilter.map((c) => `#${c}`).join(', ')}
                  </p>
                )}
              </div>
            )}

            {/* Include habits toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={includeHabits}
                onChange={(e) => setIncludeHabits(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 500 }}>Include habits</span>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>(habit-tasks due today)</span>
            </label>

            {/* Pomodoro */}
            <div
              style={{
                border: '1px solid var(--border-2)',
                borderRadius: 'var(--r)',
                padding: '10px 12px',
                background: 'var(--bg-2)',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={pomodoroEnabled}
                  onChange={(e) => setPomodoroEnabled(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 500 }}>Pomodoro mode</span>
              </label>
              {pomodoroEnabled && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, paddingLeft: 24 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t2)' }}>
                    Work
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={pomodoroWorkMin}
                      onChange={(e) => setPomodoroWorkMin(Number(e.target.value))}
                      style={{ width: 52, textAlign: 'center' }}
                    />
                    min
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t2)' }}>
                    Break
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={pomodoroBreakMin}
                      onChange={(e) => setPomodoroBreakMin(Number(e.target.value))}
                      style={{ width: 52, textAlign: 'center' }}
                    />
                    min
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--t3)', alignSelf: 'center' }}>
                    tasks split across breaks
                  </span>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '10px 16px',
                borderRadius: 'var(--r)',
                background: 'var(--accent)',
                color: 'var(--accent-text)',
                border: 'none',
                cursor: submitting ? 'default' : 'pointer',
                opacity: submitting ? 0.5 : 1,
                fontSize: 13,
                fontWeight: 600,
                minHeight: 44,
                letterSpacing: '0.03em',
              }}
            >
              {submitting ? 'Creating…' : 'Create & Auto-fill'}
            </button>
          </form>
        </div>
      )}

      {/* ── Workblock list ── */}
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '12px 16px 24px' }}>
        {loading && (
          <p style={{ color: 'var(--t3)', fontSize: 13, padding: '24px 0' }}>Loading…</p>
        )}
        {!loading && workblocks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t3)', fontSize: 13 }}>
            <p>No workblocks. Tap <strong style={{ color: 'var(--t2)' }}>+ new</strong> to create one.</p>
          </div>
        )}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {workblocks
            .slice()
            .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
            .map((wb) => {
              const filled  = fillWorkblock(wb, tasks, new Date());
              const blockMin = (new Date(wb.end).getTime() - new Date(wb.start).getTime()) / 60_000;
              const usedMin  = blockMin - filled.remainingMinutes;
              const usedPct  = blockMin > 0 ? Math.min(100, (usedMin / blockMin) * 100) : 0;

              return (
                <li
                  key={wb.id}
                  style={{
                    background: 'var(--bg-1)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Usage bar */}
                  <div style={{ height: 2, background: 'var(--bg-3)' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${usedPct.toFixed(1)}%`,
                        background: 'var(--accent)',
                      }}
                    />
                  </div>

                  {/* Header */}
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--t1)',
                            margin: 0,
                            lineHeight: 1.3,
                          }}
                        >
                          {fmtDate(wb.start)} → {fmtDate(wb.end)}
                        </p>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '2px 8px',
                            marginTop: 4,
                            fontSize: 11,
                            color: 'var(--t2)',
                          }}
                        >
                          <span>{formatDuration(Math.round(blockMin))} block</span>
                          <span style={{ color: 'var(--border-2)' }}>·</span>
                          <span>{formatDuration(Math.round(usedMin))} used</span>
                          {filled.remainingMinutes > 0.5 && (
                            <>
                              <span style={{ color: 'var(--border-2)' }}>·</span>
                              <span style={{ color: 'var(--t3)' }}>{formatDuration(Math.round(filled.remainingMinutes))} free</span>
                            </>
                          )}
                          <span style={{ color: 'var(--border-2)' }}>·</span>
                          <span>{filled.filledTasks.length} task{filled.filledTasks.length !== 1 ? 's' : ''}</span>
                          <span style={{ color: 'var(--border-2)' }}>·</span>
                          <span>{wb.onOverrun === 'abortTask' ? 'abort' : 'extend'}</span>
                          {wb.categoryFilter && wb.categoryFilter.length > 0 && (
                            <>
                              <span style={{ color: 'var(--border-2)' }}>·</span>
                              <span style={{ color: 'var(--accent)' }}>
                                {wb.categoryFilter.map((c) => `#${c}`).join(' ')}
                              </span>
                            </>
                          )}
                          {wb.pomodoroEnabled && (
                            <>
                              <span style={{ color: 'var(--border-2)' }}>·</span>
                              <span>🍅 {wb.pomodoroWorkMin ?? 25}/{wb.pomodoroBreakMin ?? 5}m</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => {
                            const ics = workblockToIcs(filled, taskMap);
                            downloadFile(ics, `workblock-${wb.id.slice(0, 8)}.ics`, 'text/calendar;charset=utf-8');
                          }}
                          style={{
                            fontSize: 11,
                            padding: '4px 8px',
                            borderRadius: 'var(--r)',
                            border: '1px solid var(--border-2)',
                            background: 'transparent',
                            color: 'var(--t2)',
                            cursor: 'pointer',
                            minHeight: 28,
                          }}
                        >
                          .ics
                        </button>
                        <button
                          onClick={() => deleteWorkblock(wb.id)}
                          style={{
                            fontSize: 11,
                            padding: '4px 8px',
                            borderRadius: 'var(--r)',
                            border: '1px solid transparent',
                            background: 'transparent',
                            color: 'var(--error)',
                            cursor: 'pointer',
                            minHeight: 28,
                          }}
                        >
                          del
                        </button>
                      </div>
                    </div>

                    {/* Habit fixed slots + task segments */}
                    <div style={{ marginTop: 10 }}>
                      <HabitSlots slots={getHabitSlotsForBlock(tasks.filter((t) => t.isHabit), wb)} />
                      <SegmentList segments={filled.segments} taskMap={taskMap} />
                    </div>
                  </div>
                </li>
              );
            })}
        </ul>
      </main>
    </div>
  );
}
