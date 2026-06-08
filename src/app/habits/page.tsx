'use client';

import { useEffect, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/dexie';
import type { Habit } from '@/types';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';
import { syncUpsertHabit, syncDeleteHabit } from '@/lib/sync/supabase-sync';

// ─── date helpers ─────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Returns YYYY-MM-DD in local time */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── habit logic ─────────────────────────────────────────────────────────────

function isDueOn(habit: Habit, day: Date): boolean {
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekly') {
    const dow = day.getDay();
    return habit.customDays?.includes(dow) ?? false;
  }
  if (habit.frequency === 'custom') {
    const intervalDays = habit.customDays?.[0] ?? 1;
    const created = startOfDay(new Date(habit.createdAt));
    const target = startOfDay(day);
    const diffDays = Math.round((target.getTime() - created.getTime()) / 86_400_000);
    return diffDays >= 0 && diffDays % intervalDays === 0;
  }
  return false;
}

function isCompletedOn(habit: Habit, day: Date): boolean {
  return habit.completionLog.includes(toDateStr(day));
}

function currentStreak(habit: Habit, today: Date): number {
  const completedSet = new Set(habit.completionLog);
  let streak = 0;
  let cursor = startOfDay(today);
  // If not yet completed today but was yesterday, count from yesterday
  // (so the streak doesn't reset at midnight before you check in)
  while (true) {
    const dateStr = toDateStr(cursor);
    if (completedSet.has(dateStr)) {
      streak++;
      cursor = addDays(cursor, -1);
    } else {
      // Allow one "today not yet done" grace without breaking streak
      if (streak === 0) {
        const yesterday = addDays(cursor, -1);
        if (completedSet.has(toDateStr(yesterday))) {
          cursor = yesterday;
          continue;
        }
      }
      break;
    }
  }
  return streak;
}

function longestStreak(habit: Habit): number {
  if (!habit.completionLog.length) return 0;
  // Deduplicate and sort
  const sorted = [...new Set(habit.completionLog)].sort();
  let max = 1;
  let cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    if (diff === 1) {
      cur++;
      if (cur > max) max = cur;
    } else if (diff > 1) {
      cur = 1;
    }
  }
  return max;
}

function freqLabel(habit: Habit): string {
  if (habit.frequency === 'daily') return 'Daily';
  if (habit.frequency === 'weekly') {
    const days = (habit.customDays ?? []).map((d) => DOW_LABELS[d]).join(', ');
    return days || 'Weekly';
  }
  const interval = habit.customDays?.[0] ?? 1;
  return interval === 1 ? 'Daily' : `Every ${interval} days`;
}

// ─── styles ───────────────────────────────────────────────────────────────────

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'var(--t2)',
  marginBottom: 4,
};

const CARD: React.CSSProperties = {
  background: 'var(--bg-1)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  overflow: 'hidden',
};

// ─── blank form state ────────────────────────────────────────────────────────

interface FormState {
  title: string;
  frequency: Habit['frequency'];
  customDays: number[];
  intervalDays: number;
  targetTime: string;
}

const BLANK_FORM: FormState = {
  title: '',
  frequency: 'daily',
  customDays: [],
  intervalDays: 1,
  targetTime: '',
};

// ─── HabitsPage ───────────────────────────────────────────────────────────────

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const today = startOfDay(new Date());

  const loadHabits = useCallback(async () => {
    const all = await db.habits.toArray();
    // Sort by createdAt desc
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setHabits(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadHabits();
  }, [loadHabits]);

  // ── checklist: habits due today ─────────────────────────────────────────
  const dueToday = habits.filter((h) => isDueOn(h, today));
  const doneToday = dueToday.filter((h) => isCompletedOn(h, today));
  const pendingToday = dueToday.filter((h) => !isCompletedOn(h, today));

  const handleToggle = async (habit: Habit) => {
    const dateStr = toDateStr(today);
    const alreadyDone = habit.completionLog.includes(dateStr);
    const newLog = alreadyDone
      ? habit.completionLog.filter((d) => d !== dateStr)
      : [...habit.completionLog, dateStr];
    const updated: Habit = { ...habit, completionLog: newLog, updatedAt: new Date().toISOString() };
    await db.habits.put(updated);
    syncUpsertHabit(updated);
    setHabits((prev) => prev.map((h) => (h.id === habit.id ? updated : h)));
  };

  // ── form helpers ───────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (habit: Habit) => {
    setEditingId(habit.id);
    setForm({
      title: habit.title,
      frequency: habit.frequency,
      customDays: habit.customDays ?? [],
      intervalDays: habit.customDays?.[0] ?? 1,
      targetTime: habit.targetTime ?? '',
    });
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    if (form.frequency === 'weekly' && form.customDays.length === 0) {
      setFormError('Choose at least one day of the week.');
      return;
    }
    if (form.frequency === 'custom' && form.intervalDays < 1) {
      setFormError('Interval must be at least 1 day.');
      return;
    }

    setSubmitting(true);

    const customDaysValue: number[] | undefined =
      form.frequency === 'weekly'
        ? form.customDays
        : form.frequency === 'custom'
        ? [form.intervalDays]
        : undefined;

    const now = new Date().toISOString();
    if (editingId) {
      const existing = habits.find((h) => h.id === editingId);
      if (!existing) { setSubmitting(false); return; }
      const updated: Habit = {
        ...existing,
        title: form.title.trim(),
        frequency: form.frequency,
        customDays: customDaysValue,
        targetTime: form.targetTime || undefined,
        updatedAt: now,
      };
      await db.habits.put(updated);
      syncUpsertHabit(updated);
    } else {
      const newHabit: Habit = {
        id: uuidv4(),
        title: form.title.trim(),
        frequency: form.frequency,
        customDays: customDaysValue,
        targetTime: form.targetTime || undefined,
        completionLog: [],
        createdAt: now,
        updatedAt: now,
      };
      await db.habits.add(newHabit);
      syncUpsertHabit(newHabit);
    }

    setSubmitting(false);
    closeForm();
    loadHabits();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this habit and all its history?')) return;
    await db.habits.delete(id);
    syncDeleteHabit(id);
    setHabits((prev) => prev.filter((h) => h.id !== id));
  };

  const toggleDayOfWeek = (dow: number) => {
    setForm((f) => ({
      ...f,
      customDays: f.customDays.includes(dow)
        ? f.customDays.filter((d) => d !== dow)
        : [...f.customDays, dow],
    }));
  };

  // ─────────────────────────────────────────────────────────────────────────

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
              Habits
            </h1>
            <p style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>
              {loading ? 'loading…' : `${doneToday.length}/${dueToday.length} done today`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ThemeToggleButton />
            <button
              onClick={showForm ? closeForm : openCreate}
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

      {/* ── Create / Edit form ── */}
      {showForm && (
        <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-1)' }}>
          <form
            onSubmit={handleSubmit}
            style={{ maxWidth: 640, margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div
              style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--accent)', marginBottom: -4,
              }}
            >
              {editingId ? 'Edit habit' : 'New habit'}
            </div>

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

            {/* Title */}
            <div>
              <label style={fieldLabel}>Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Morning run"
                required
                style={{ width: '100%' }}
                autoFocus
              />
            </div>

            {/* Frequency */}
            <div>
              <label style={fieldLabel}>Frequency</label>
              <select
                value={form.frequency}
                onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as Habit['frequency'] }))}
                style={{ width: '100%' }}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly (specific days)</option>
                <option value="custom">Custom interval</option>
              </select>
            </div>

            {/* Weekly day picker */}
            {form.frequency === 'weekly' && (
              <div>
                <label style={fieldLabel}>Days of week</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DOW_LABELS.map((label, dow) => {
                    const active = form.customDays.includes(dow);
                    return (
                      <button
                        key={dow}
                        type="button"
                        onClick={() => toggleDayOfWeek(dow)}
                        style={{
                          width: 40, height: 36,
                          borderRadius: 'var(--r)',
                          border: '1px solid',
                          borderColor: active ? 'var(--accent)' : 'var(--border-2)',
                          background: active ? 'var(--accent-dim)' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--t2)',
                          cursor: 'pointer',
                          fontSize: 11,
                          fontWeight: active ? 700 : 400,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom interval */}
            {form.frequency === 'custom' && (
              <div>
                <label style={fieldLabel}>Every N days</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={form.intervalDays}
                  onChange={(e) => setForm((f) => ({ ...f, intervalDays: Number(e.target.value) }))}
                  style={{ width: 80 }}
                />
              </div>
            )}

            {/* Target time */}
            <div>
              <label style={fieldLabel}>Target time (optional)</label>
              <input
                type="time"
                value={form.targetTime}
                onChange={(e) => setForm((f) => ({ ...f, targetTime: e.target.value }))}
                style={{ width: 140 }}
              />
              <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                If set, appears as a fixed block in workblock timelines.
              </p>
            </div>

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
              {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Create habit'}
            </button>
          </form>
        </div>
      )}

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '12px 16px 32px' }}>
        {loading && (
          <p style={{ color: 'var(--t3)', fontSize: 13, padding: '24px 0' }}>Loading…</p>
        )}

        {!loading && habits.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t3)', fontSize: 13 }}>
            <p>No habits yet. Tap <strong style={{ color: 'var(--t2)' }}>+ new</strong> to add one.</p>
          </div>
        )}

        {/* ── Today's checklist ── */}
        {!loading && dueToday.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--t2)',
                marginBottom: 10,
              }}
            >
              Today — {new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>

            {/* Progress bar */}
            {dueToday.length > 0 && (
              <div style={{ height: 3, background: 'var(--bg-3)', borderRadius: 2, marginBottom: 12, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${((doneToday.length / dueToday.length) * 100).toFixed(1)}%`,
                    background: doneToday.length === dueToday.length ? 'var(--ok)' : 'var(--accent)',
                    borderRadius: 2,
                    transition: 'width 300ms ease',
                  }}
                />
              </div>
            )}

            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Pending first, then done */}
              {[...pendingToday, ...doneToday].map((habit) => {
                const done = isCompletedOn(habit, today);
                const streak = currentStreak(habit, today);
                return (
                  <li
                    key={habit.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 'var(--r-md)',
                      background: done ? 'var(--bg-2)' : 'var(--bg-1)',
                      border: `1px solid ${done ? 'var(--border)' : 'var(--border-2)'}`,
                      transition: 'background 200ms, border-color 200ms',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleToggle(habit)}
                  >
                    {/* Checkbox */}
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        border: `2px solid ${done ? 'var(--ok)' : 'var(--border-2)'}`,
                        background: done ? 'var(--ok)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'background 200ms, border-color 200ms',
                      }}
                    >
                      {done && (
                        <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                          <path d="M1 4L4.5 7.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>

                    {/* Title & meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          color: done ? 'var(--t3)' : 'var(--t1)',
                          fontWeight: done ? 400 : 500,
                          textDecoration: done ? 'line-through' : 'none',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {habit.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2, display: 'flex', gap: 8 }}>
                        {habit.targetTime && <span>⏱ {habit.targetTime}</span>}
                        {streak > 0 && (
                          <span style={{ color: streak >= 7 ? '#f59e0b' : 'var(--t3)' }}>
                            🔥 {streak} day{streak !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ── All habits list ── */}
        {!loading && habits.length > 0 && (
          <section>
            <div
              style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--t2)',
                marginBottom: 10,
              }}
            >
              All habits
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {habits.map((habit) => {
                const streak = currentStreak(habit, today);
                const longest = longestStreak(habit);
                const totalDone = new Set(habit.completionLog).size;
                const isDue = isDueOn(habit, today);

                return (
                  <li key={habit.id} style={CARD}>
                    {/* Streak bar */}
                    <div style={{ height: 2, background: streak > 0 ? '#f59e0b' : 'var(--bg-3)' }} />

                    <div style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>
                            {habit.title}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span>{freqLabel(habit)}</span>
                            {habit.targetTime && <span>⏱ {habit.targetTime}</span>}
                            {isDue && (
                              <span
                                style={{
                                  color: isCompletedOn(habit, today) ? 'var(--ok)' : 'var(--accent)',
                                  fontWeight: 600,
                                }}
                              >
                                {isCompletedOn(habit, today) ? '✓ done today' : '• due today'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button
                            onClick={() => openEdit(habit)}
                            style={{
                              fontSize: 11, padding: '4px 8px',
                              borderRadius: 'var(--r)',
                              border: '1px solid var(--border-2)',
                              background: 'transparent',
                              color: 'var(--t2)',
                              cursor: 'pointer', minHeight: 28,
                            }}
                          >
                            edit
                          </button>
                          <button
                            onClick={() => handleDelete(habit.id)}
                            style={{
                              fontSize: 11, padding: '4px 8px',
                              borderRadius: 'var(--r)',
                              border: '1px solid transparent',
                              background: 'transparent',
                              color: 'var(--error)',
                              cursor: 'pointer', minHeight: 28,
                            }}
                          >
                            del
                          </button>
                        </div>
                      </div>

                      {/* Streak stats */}
                      <div
                        style={{
                          display: 'flex', gap: 20, marginTop: 10,
                          paddingTop: 8,
                          borderTop: '1px solid var(--border)',
                        }}
                      >
                        <StatChip
                          value={streak}
                          label="current streak"
                          color={streak >= 7 ? '#f59e0b' : streak >= 3 ? 'var(--accent)' : 'var(--t2)'}
                          suffix=" day"
                          plural
                        />
                        <StatChip
                          value={longest}
                          label="longest streak"
                          suffix=" day"
                          plural
                        />
                        <StatChip
                          value={totalDone}
                          label="total completions"
                        />
                      </div>

                      {/* 7-day mini heatmap */}
                      <MiniHeatmap habit={habit} today={today} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

// ─── StatChip ─────────────────────────────────────────────────────────────────

function StatChip({
  value,
  label,
  color,
  suffix = '',
  plural = false,
}: {
  value: number;
  label: string;
  color?: string;
  suffix?: string;
  plural?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1,
          color: color ?? 'var(--t1)',
          letterSpacing: '-0.02em',
          fontFamily: 'var(--ff-dm-sans, sans-serif)',
        }}
      >
        {value}{suffix}{plural && value !== 1 ? 's' : ''}
      </div>
      <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ─── MiniHeatmap (last 21 days) ───────────────────────────────────────────────

function MiniHeatmap({ habit, today }: { habit: Habit; today: Date }) {
  const completedSet = new Set(habit.completionLog);
  const days: { date: Date; done: boolean; due: boolean }[] = [];
  for (let i = 20; i >= 0; i--) {
    const d = startOfDay(addDays(today, -i));
    days.push({ date: d, done: completedSet.has(toDateStr(d)), due: isDueOn(habit, d) });
  }

  return (
    <div style={{ marginTop: 10, display: 'flex', gap: 2, alignItems: 'flex-end' }}>
      {days.map((d, i) => {
        const isToday = i === 20;
        let bg: string;
        if (d.done) bg = 'var(--ok)';
        else if (d.due) bg = 'var(--bg-3)';
        else bg = 'transparent';

        return (
          <div
            key={i}
            title={`${d.date.toLocaleDateString()} — ${d.done ? 'done' : d.due ? 'missed' : 'not due'}`}
            style={{
              flex: 1,
              height: d.done ? 16 : d.due ? 8 : 4,
              borderRadius: 2,
              background: bg,
              outline: isToday ? '1.5px solid var(--accent)' : 'none',
              outlineOffset: 1,
              transition: 'height 200ms',
            }}
          />
        );
      })}
    </div>
  );
}
