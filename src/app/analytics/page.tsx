'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db/dexie';
import type { Task, TimerSession, Habit } from '@/types';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// ─── helpers ────────────────────────────────────────────────────────────────

function sessionDurationMs(s: TimerSession): number {
  if (!s.endedAt) return 0;
  return Math.max(0, new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime() - s.pausedMs);
}

function isoToDate(iso: string) {
  return new Date(iso);
}

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

function weekLabel(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function median(vals: number[]): number {
  if (!vals.length) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(vals: number[]): number {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ─── sub-components ─────────────────────────────────────────────────────────

const ACCENT = '#3b82f6';
const OK = '#22c55e';
const WARN = '#f59e0b';
const ERR = '#ef4444';

const CARD: React.CSSProperties = {
  background: 'var(--bg-1)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  padding: '20px 20px 16px',
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--t2)',
  marginBottom: 16,
};

const STAT_VAL: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 700,
  lineHeight: 1,
  letterSpacing: '-0.03em',
  color: 'var(--t1)',
};

const STAT_LABEL: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--t2)',
  marginTop: 4,
};

function StatBlock({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div>
      <div style={{ ...STAT_VAL, color: color ?? 'var(--t1)' }}>{value}</div>
      <div style={STAT_LABEL}>{label}</div>
    </div>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: { value: number; name?: string }[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--r)',
        padding: '6px 10px',
        fontSize: 12,
        color: 'var(--t1)',
      }}
    >
      {label && <div style={{ color: 'var(--t2)', marginBottom: 2 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i}>{p.name ? `${p.name}: ` : ''}{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</div>
      ))}
    </div>
  );
}

// ─── main page ──────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<TimerSession[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [t, s, h] = await Promise.all([
        db.tasks.toArray(),
        db.timerSessions.toArray(),
        db.habits.toArray(),
      ]);
      setTasks(t);
      setSessions(s);
      setHabits(h);
      setLoading(false);
    }
    load();
  }, []);

  // ── 1. Deadline adherence ────────────────────────────────────────────────
  const deadlineStats = useMemo(() => {
    const eligible = tasks.filter(
      (t) => t.status === 'done' && t.deadline && t.completedAt,
    );
    if (!eligible.length) return null;

    const diffs = eligible.map((t) => {
      const diffH = (new Date(t.completedAt!).getTime() - new Date(t.deadline!).getTime()) / 3.6e6;
      return diffH;
    });

    const onTime = diffs.filter((d) => d <= 0).length;
    const pct = Math.round((onTime / diffs.length) * 100);
    const avgLateness = mean(diffs);

    // histogram buckets (hours relative to deadline)
    const buckets = [
      { label: '< −48h', min: -Infinity, max: -48 },
      { label: '−48–24h', min: -48, max: -24 },
      { label: '−24–0h', min: -24, max: 0 },
      { label: '0–24h', min: 0, max: 24 },
      { label: '24–48h', min: 24, max: 48 },
      { label: '> 48h', min: 48, max: Infinity },
    ];
    const hist = buckets.map((b) => ({
      label: b.label,
      count: diffs.filter((d) => d >= b.min && d < b.max).length,
      isLate: b.min >= 0,
    }));

    return { pct, avgLateness, hist, total: eligible.length };
  }, [tasks]);

  // ── 2. Hours completed ───────────────────────────────────────────────────
  const hoursStats = useMemo(() => {
    const completed = sessions.filter((s) => s.endedAt);
    const totalMs = completed.reduce((a, s) => a + sessionDurationMs(s), 0);
    const totalH = totalMs / 3.6e6;

    // category breakdown
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const byCat: Record<string, number> = {};
    for (const s of completed) {
      const cat = taskMap.get(s.taskId)?.category ?? 'Uncategorised';
      byCat[cat] = (byCat[cat] ?? 0) + sessionDurationMs(s) / 3.6e6;
    }
    const catData = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, hours]) => ({ name, hours: +hours.toFixed(2) }));

    // weekly trend (last 8 weeks, week starts on Monday)
    const now = new Date();
    const weekData: { label: string; hours: number }[] = [];
    for (let w = 7; w >= 0; w--) {
      const weekStart = startOfDay(addDays(now, -w * 7 - now.getDay() + 1));
      const weekEnd = addDays(weekStart, 7);
      const wH = completed
        .filter((s) => {
          const d = isoToDate(s.startedAt);
          return d >= weekStart && d < weekEnd;
        })
        .reduce((a, s) => a + sessionDurationMs(s) / 3.6e6, 0);
      weekData.push({ label: weekLabel(weekStart), hours: +wH.toFixed(2) });
    }

    return { totalH: +totalH.toFixed(1), catData, weekData };
  }, [tasks, sessions]);

  // ── 3. Estimation accuracy ───────────────────────────────────────────────
  const estimationStats = useMemo(() => {
    const doneTasks = tasks.filter((t) => t.status === 'done' && t.effortMin > 0);
    const ratios: number[] = [];
    let timerlessCount = 0;

    for (const t of doneTasks) {
      const taskSessions = sessions.filter((s) => s.taskId === t.id && s.endedAt);
      if (!taskSessions.length) {
        timerlessCount++;
        continue;
      }
      const actualMs = taskSessions.reduce((a, s) => a + sessionDurationMs(s), 0);
      const actualMin = actualMs / 60_000;
      ratios.push(actualMin / t.effortMin);
    }

    if (!ratios.length) return null;

    const med = median(ratios);
    const avg = mean(ratios);
    const pctLonger = Math.round((avg - 1) * 100);

    // Distribution histogram (ratio buckets)
    const buckets = [
      { label: '< 0.5×', min: 0, max: 0.5 },
      { label: '0.5–0.75×', min: 0.5, max: 0.75 },
      { label: '0.75–1×', min: 0.75, max: 1 },
      { label: '1–1.25×', min: 1, max: 1.25 },
      { label: '1.25–1.5×', min: 1.25, max: 1.5 },
      { label: '1.5–2×', min: 1.5, max: 2 },
      { label: '> 2×', min: 2, max: Infinity },
    ];
    const hist = buckets.map((b) => ({
      label: b.label,
      count: ratios.filter((r) => r >= b.min && r < b.max).length,
      isOver: b.min >= 1,
    }));

    return { med: +med.toFixed(2), avg: +avg.toFixed(2), pctLonger, hist, timerlessCount, total: ratios.length };
  }, [tasks, sessions]);

  // ── 4. Consistency ──────────────────────────────────────────────────────
  const consistencyStats = useMemo(() => {
    const today = startOfDay(new Date());

    // build set of days with task completions
    const doneTasks = tasks.filter((t) => t.status === 'done' && t.completedAt);
    const completionDays = new Set(
      doneTasks.map((t) => startOfDay(new Date(t.completedAt!)).getTime()),
    );

    // habit completion days (per-day count from completionLog ISO date strings)
    const habitCompletionsByDay: Map<number, number> = new Map();
    for (const habit of habits) {
      for (const dateStr of habit.completionLog) {
        const dayTs = startOfDay(new Date(dateStr)).getTime();
        habitCompletionsByDay.set(dayTs, (habitCompletionsByDay.get(dayTs) ?? 0) + 1);
      }
    }

    // calendar heatmap: last 35 days (5 weeks × 7)
    const calDays: { date: Date; count: number; habitCount: number }[] = [];
    for (let i = 34; i >= 0; i--) {
      const d = startOfDay(addDays(today, -i));
      const count = doneTasks.filter(
        (t) => startOfDay(new Date(t.completedAt!)).getTime() === d.getTime(),
      ).length;
      const habitCount = habitCompletionsByDay.get(d.getTime()) ?? 0;
      calDays.push({ date: d, count, habitCount });
    }

    // current streak (tasks or habits)
    const anyActivityDays = new Set([
      ...completionDays,
      ...[...habitCompletionsByDay.keys()],
    ]);
    let streak = 0;
    let cursor = today;
    while (anyActivityDays.has(cursor.getTime())) {
      streak++;
      cursor = startOfDay(addDays(cursor, -1));
    }

    // days with completions in last 30
    const cutoff = startOfDay(addDays(today, -29)).getTime();
    const activeDays = [...anyActivityDays].filter((d) => d >= cutoff).length;

    return { calDays, streak, activeDays };
  }, [tasks, habits]);

  // ────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--t2)', fontSize: 13 }}>Loading…</div>
    );
  }

  const doneTasks = tasks.filter((t) => t.status === 'done');

  return (
    <div style={{ padding: '16px 16px 32px', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--t1)',
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          Analytics
        </h1>
        <div style={{ color: 'var(--t2)', fontSize: 12, marginTop: 4 }}>
          {doneTasks.length} tasks completed · {sessions.filter((s) => s.endedAt).length} timer sessions
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ── 1. Deadline Adherence ── */}
        <section style={CARD}>
          <div style={SECTION_TITLE}>Deadline Adherence</div>
          {!deadlineStats ? (
            <EmptyState text="Complete tasks with deadlines to see adherence data." />
          ) : (
            <>
              <div style={{ display: 'flex', gap: 32, marginBottom: 20, flexWrap: 'wrap' }}>
                <StatBlock
                  value={`${deadlineStats.pct}%`}
                  label={`on time (${deadlineStats.total} tasks)`}
                  color={deadlineStats.pct >= 80 ? OK : deadlineStats.pct >= 50 ? WARN : ERR}
                />
                <StatBlock
                  value={`${deadlineStats.avgLateness >= 0 ? '+' : ''}${deadlineStats.avgLateness.toFixed(1)}h`}
                  label="avg lateness (− = early)"
                  color={deadlineStats.avgLateness <= 0 ? OK : deadlineStats.avgLateness < 24 ? WARN : ERR}
                />
              </div>
              <div style={{ height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deadlineStats.hist} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--t2)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {deadlineStats.hist.map((entry, i) => (
                        <Cell key={i} fill={entry.isLate ? ERR : OK} opacity={entry.count === 0 ? 0.2 : 0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ fontSize: 10, color: 'var(--t2)', marginTop: 4 }}>
                Green = completed early · Red = completed late
              </div>
            </>
          )}
        </section>

        {/* ── 2. Hours Completed ── */}
        <section style={CARD}>
          <div style={SECTION_TITLE}>Hours Completed</div>
          <div style={{ display: 'flex', gap: 32, marginBottom: 20, flexWrap: 'wrap' }}>
            <StatBlock value={`${hoursStats.totalH}h`} label="total time tracked" />
            <StatBlock
              value={`${hoursStats.catData.length}`}
              label="categories"
            />
          </div>

          {hoursStats.weekData.some((w) => w.hours > 0) ? (
            <>
              <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 8 }}>Weekly trend (last 8 weeks)</div>
              <div style={{ height: 120 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hoursStats.weekData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="hours"
                      stroke={ACCENT}
                      strokeWidth={2}
                      dot={{ fill: ACCENT, r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <EmptyState text="Start the per-task timer to track time spent." />
          )}

          {hoursStats.catData.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: 'var(--t2)', margin: '16px 0 8px' }}>By category</div>
              <div style={{ height: Math.max(80, hoursStats.catData.length * 28) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={hoursStats.catData}
                    margin={{ top: 0, right: 40, left: 4, bottom: 0 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: 'var(--t1)' }}
                      axisLine={false}
                      tickLine={false}
                      width={90}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="hours" fill={ACCENT} opacity={0.85} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </section>

        {/* ── 3. Estimation Accuracy ── */}
        <section style={CARD}>
          <div style={SECTION_TITLE}>Estimation Accuracy</div>
          {!estimationStats ? (
            <EmptyState text="Complete timed tasks to see how your estimates compare to actuals." />
          ) : (
            <>
              <div style={{ display: 'flex', gap: 32, marginBottom: 8, flexWrap: 'wrap' }}>
                <StatBlock
                  value={`${estimationStats.med}×`}
                  label="median actual / estimate"
                  color={estimationStats.med > 1.2 ? WARN : OK}
                />
                <StatBlock
                  value={`${estimationStats.avg}×`}
                  label="mean actual / estimate"
                  color={estimationStats.avg > 1.2 ? WARN : OK}
                />
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--t2)',
                  marginBottom: 16,
                  padding: '8px 12px',
                  background: 'var(--bg-2)',
                  borderRadius: 'var(--r)',
                }}
              >
                {estimationStats.pctLonger > 5 ? (
                  <>
                    You typically take{' '}
                    <span style={{ color: WARN, fontWeight: 600 }}>
                      {estimationStats.pctLonger}% longer
                    </span>{' '}
                    than estimated.
                  </>
                ) : estimationStats.pctLonger < -5 ? (
                  <>
                    You typically finish{' '}
                    <span style={{ color: OK, fontWeight: 600 }}>
                      {Math.abs(estimationStats.pctLonger)}% faster
                    </span>{' '}
                    than estimated.
                  </>
                ) : (
                  <span style={{ color: OK }}>Your estimates are well-calibrated. 🎯</span>
                )}
              </div>
              <div style={{ height: 130 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={estimationStats.hist} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--t2)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {estimationStats.hist.map((entry, i) => (
                        <Cell key={i} fill={entry.isOver ? WARN : ACCENT} opacity={entry.count === 0 ? 0.2 : 0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ fontSize: 10, color: 'var(--t2)', marginTop: 4 }}>
                Blue = faster than estimated · Yellow = slower · Based on {estimationStats.total} timed tasks
                {estimationStats.timerlessCount > 0 && ` · ${estimationStats.timerlessCount} tasks excluded (no timer)`}
              </div>
            </>
          )}
        </section>

        {/* ── 4. Consistency ── */}
        <section style={CARD}>
          <div style={SECTION_TITLE}>Consistency</div>
          <div style={{ display: 'flex', gap: 32, marginBottom: 20, flexWrap: 'wrap' }}>
            <StatBlock
              value={`${consistencyStats.streak}`}
              label="day streak"
              color={consistencyStats.streak >= 7 ? OK : consistencyStats.streak >= 3 ? WARN : 'var(--t1)'}
            />
            <StatBlock
              value={`${consistencyStats.activeDays}`}
              label="active days (last 30)"
            />
          </div>

          {/* Calendar heatmap */}
          <CalendarHeatmap days={consistencyStats.calDays} />
        </section>
      </div>
    </div>
  );
}

// ─── Calendar heatmap ────────────────────────────────────────────────────────

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function CalendarHeatmap({
  days,
}: {
  days: { date: Date; count: number; habitCount: number }[];
}) {
  const today = startOfDay(new Date());

  return (
    <div>
      <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            style={{
              flex: 1,
              fontSize: 9,
              color: 'var(--t2)',
              textAlign: 'center',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {days.map((d, i) => {
          const isToday = d.date.getTime() === today.getTime();
          const total = d.count + d.habitCount;
          // task completions → blue channel; habit completions → green tint overlay
          const taskIntensity = d.count === 0 ? 0 : d.count === 1 ? 0.4 : d.count <= 3 ? 0.65 : 0.9;
          const habitIntensity = d.habitCount === 0 ? 0 : d.habitCount === 1 ? 0.35 : d.habitCount <= 3 ? 0.55 : 0.8;
          const bg =
            d.count > 0 && d.habitCount > 0
              ? `rgba(80, 160, 120, ${Math.max(taskIntensity, habitIntensity)})`  // mixed teal
              : d.count > 0
              ? `rgba(59, 130, 246, ${taskIntensity})`   // blue = tasks
              : d.habitCount > 0
              ? `rgba(34, 197, 94, ${habitIntensity})`   // green = habits only
              : 'var(--bg-3)';
          const tooltipParts: string[] = [];
          if (d.count) tooltipParts.push(`${d.count} task${d.count !== 1 ? 's' : ''}`);
          if (d.habitCount) tooltipParts.push(`${d.habitCount} habit${d.habitCount !== 1 ? 's' : ''}`);
          return (
            <div
              key={i}
              title={`${d.date.toLocaleDateString()} — ${total === 0 ? 'no activity' : tooltipParts.join(', ')}`}
              style={{
                width: 'calc((100% - 6 * 3px) / 7)',
                aspectRatio: '1',
                borderRadius: 3,
                background: bg,
                outline: isToday ? `2px solid ${ACCENT}` : 'none',
                outlineOffset: 1,
              }}
            />
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--t2)', marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>Last 35 days</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'rgba(59,130,246,0.7)' }} />
          tasks
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'rgba(34,197,94,0.7)' }} />
          habits
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'rgba(80,160,120,0.7)' }} />
          both
        </span>
      </div>
    </div>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────────────

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: '24px 0',
        textAlign: 'center',
        color: 'var(--t2)',
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}
