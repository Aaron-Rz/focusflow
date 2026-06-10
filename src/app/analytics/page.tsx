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

// ─── helpers ─────────────────────────────────────────────────────────────────

function sessionDurationMs(s: TimerSession): number {
  if (!s.endedAt) return 0;
  return Math.max(0, new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime() - s.pausedMs);
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

function inWindow(dateStr: string, from: Date, to: Date): boolean {
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

// ─── types ───────────────────────────────────────────────────────────────────

type WindowPreset = '7d' | '30d' | '90d' | '1y' | 'all' | 'custom';

const WINDOW_OPTIONS: { key: WindowPreset; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: '1y', label: '1y' },
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
];

// ─── design tokens ───────────────────────────────────────────────────────────

const ACCENT = '#3b82f6';
const OK = '#22c55e';
const WARN = '#f59e0b';
const ERR = '#ef4444';
const HABIT_CLR = '#a855f7';

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

// ─── small shared components ──────────────────────────────────────────────────

function StatBlock({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div>
      <div style={{ ...STAT_VAL, color: color ?? 'var(--t1)' }}>{value}</div>
      <div style={STAT_LABEL}>{label}</div>
    </div>
  );
}

interface TipProps {
  active?: boolean;
  payload?: { value: number; name?: string }[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: TipProps) {
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
        <div key={i}>
          {p.name ? `${p.name}: ` : ''}
          {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--t2)', fontSize: 13 }}>
      {text}
    </div>
  );
}

// ─── window selector ─────────────────────────────────────────────────────────

function WindowSelector({
  preset,
  onPreset,
  customFrom,
  customTo,
  onCustomFrom,
  onCustomTo,
}: {
  preset: WindowPreset;
  onPreset: (p: WindowPreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (s: string) => void;
  onCustomTo: (s: string) => void;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: 'inline-flex',
          gap: 2,
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: 3,
        }}
      >
        {WINDOW_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onPreset(opt.key)}
            style={{
              padding: '4px 12px',
              borderRadius: 'var(--r)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              background: preset === opt.key ? 'var(--bg-1)' : 'transparent',
              color: preset === opt.key ? 'var(--t1)' : 'var(--t2)',
              boxShadow: preset === opt.key ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              transition: 'all 0.12s',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <input
            type="date"
            value={customFrom}
            onChange={(e) => onCustomFrom(e.target.value)}
            style={{
              padding: '5px 10px',
              borderRadius: 'var(--r)',
              border: '1px solid var(--border)',
              background: 'var(--bg-1)',
              color: 'var(--t1)',
              fontSize: 13,
            }}
          />
          <span style={{ color: 'var(--t2)', fontSize: 13 }}>to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => onCustomTo(e.target.value)}
            style={{
              padding: '5px 10px',
              borderRadius: 'var(--r)',
              border: '1px solid var(--border)',
              background: 'var(--bg-1)',
              color: 'var(--t1)',
              fontSize: 13,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── calendar heatmap (tasks + habits combined) ───────────────────────────────

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function CalendarHeatmap({
  days,
  windowLabel,
}: {
  days: { date: Date; count: number; habitCount: number }[];
  windowLabel: string;
}) {
  const today = startOfDay(new Date()).getTime();
  if (!days.length) return <EmptyState text="No activity in this window." />;

  const firstDow = days[0].date.getDay(); // 0=Sun…6=Sat
  const padBefore = firstDow === 0 ? 6 : firstDow - 1; // shift to Mon=0

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 3,
          marginBottom: 4,
        }}
      >
        {DOW.map((d) => (
          <div
            key={d}
            style={{
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

        {Array.from({ length: padBefore }).map((_, i) => (
          <div key={`pad-${i}`} style={{ aspectRatio: '1' }} />
        ))}

        {days.map((d, i) => {
          const isToday = d.date.getTime() === today;
          const ti = d.count === 0 ? 0 : d.count === 1 ? 0.4 : d.count <= 3 ? 0.65 : 0.9;
          const hi = d.habitCount === 0 ? 0 : d.habitCount === 1 ? 0.35 : d.habitCount <= 3 ? 0.55 : 0.8;
          const bg =
            d.count > 0 && d.habitCount > 0
              ? `rgba(80,160,120,${Math.max(ti, hi)})`
              : d.count > 0
              ? `rgba(59,130,246,${ti})`
              : d.habitCount > 0
              ? `rgba(34,197,94,${hi})`
              : 'var(--bg-3)';
          const total = d.count + d.habitCount;
          const parts: string[] = [];
          if (d.count) parts.push(`${d.count} task${d.count !== 1 ? 's' : ''}`);
          if (d.habitCount) parts.push(`${d.habitCount} habit${d.habitCount !== 1 ? 's' : ''}`);
          return (
            <div
              key={i}
              title={`${d.date.toLocaleDateString()} — ${total === 0 ? 'no activity' : parts.join(', ')}`}
              style={{
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

      <div
        style={{
          fontSize: 10,
          color: 'var(--t2)',
          marginTop: 8,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span>{windowLabel}</span>
        {(
          [
            ['rgba(59,130,246,0.7)', 'tasks'],
            ['rgba(34,197,94,0.7)', 'habits'],
            ['rgba(80,160,120,0.7)', 'both'],
          ] as [string, string][]
        ).map(([bg, lbl]) => (
          <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 2,
                background: bg,
              }}
            />
            {lbl}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── habit heatmap (all habits combined, full window) ────────────────────────

function HabitHeatmap({
  habits,
  from,
  to,
}: {
  habits: Habit[];
  from: Date;
  to: Date;
}) {
  const totalHabits = habits.length;
  const today = startOfDay(new Date()).getTime();

  const byDay = useMemo(() => {
    const m = new Map<number, number>();
    for (const h of habits) {
      for (const d of h.completionLog) {
        const date = new Date(d);
        if (date >= from && date <= to) {
          const ts = startOfDay(date).getTime();
          m.set(ts, (m.get(ts) ?? 0) + 1);
        }
      }
    }
    return m;
  }, [habits, from, to]);

  const windowStart = startOfDay(from);
  const windowEnd = startOfDay(to);

  // Align grid start to Monday
  const startDow = windowStart.getDay();
  const padBefore = startDow === 0 ? 6 : startDow - 1;
  const gridStart = addDays(windowStart, -padBefore);

  // Align grid end to Sunday
  const endDow = windowEnd.getDay();
  const padAfter = endDow === 0 ? 0 : 7 - endDow;
  const gridEnd = addDays(windowEnd, padAfter);

  const cells: { date: Date; count: number; inWin: boolean }[] = [];
  for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) {
    const ts = startOfDay(d).getTime();
    cells.push({
      date: new Date(d),
      count: byDay.get(ts) ?? 0,
      inWin: d >= windowStart && d <= windowEnd,
    });
  }

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 3,
          marginBottom: 4,
        }}
      >
        {DOW.map((d) => (
          <div
            key={d}
            style={{
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

        {cells.map((c, i) => {
          const isToday = c.date.getTime() === today;
          const intensity = totalHabits > 0 && c.count > 0 ? 0.2 + (c.count / totalHabits) * 0.8 : 0;
          const bg = !c.inWin
            ? 'transparent'
            : c.count === 0
            ? 'var(--bg-3)'
            : `rgba(168,85,247,${intensity.toFixed(2)})`;
          return (
            <div
              key={i}
              title={
                c.inWin
                  ? `${c.date.toLocaleDateString()} — ${c.count}/${totalHabits} habits`
                  : undefined
              }
              style={{
                aspectRatio: '1',
                borderRadius: 3,
                background: bg,
                outline: isToday && c.inWin ? `2px solid ${ACCENT}` : 'none',
                outlineOffset: 1,
              }}
            />
          );
        })}
      </div>

      <div
        style={{
          fontSize: 10,
          color: 'var(--t2)',
          marginTop: 4,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}
      >
        <span>0</span>
        {[0.2, 0.4, 0.6, 0.8, 1.0].map((a) => (
          <span
            key={a}
            style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              borderRadius: 2,
              background: `rgba(168,85,247,${a})`,
            }}
          />
        ))}
        <span>{totalHabits} habits</span>
      </div>
    </div>
  );
}

// ─── habit stats helpers ──────────────────────────────────────────────────────

function computeStreaks(log: string[]) {
  const dates = [...new Set(log)]
    .map((d) => startOfDay(new Date(d)))
    .sort((a, b) => a.getTime() - b.getTime());

  if (!dates.length) return { current: 0, best: 0, avgLength: 0 };

  const streaks: number[] = [];
  let cur = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (dates[i].getTime() - dates[i - 1].getTime()) / 86400000;
    if (diff === 1) {
      cur++;
    } else {
      streaks.push(cur);
      cur = 1;
    }
  }
  streaks.push(cur);

  const best = Math.max(...streaks);

  const today = startOfDay(new Date());
  const daySet = new Set(dates.map((d) => d.getTime()));
  let current = 0;
  let cursor = today;
  while (daySet.has(cursor.getTime())) {
    current++;
    cursor = addDays(cursor, -1);
  }

  return { current, best, avgLength: +mean(streaks).toFixed(1) };
}

function expectedOccurrences(h: Habit, from: Date, to: Date): number {
  if (h.frequency === 'daily') {
    return Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1;
  }
  if (h.frequency === 'weekly') {
    const dows = h.customDays ?? [];
    if (!dows.length) return 0;
    let n = 0;
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      if (dows.includes(d.getDay())) n++;
    }
    return n;
  }
  if (h.frequency === 'custom' && h.customDays?.length) {
    const interval = h.customDays[0];
    return Math.floor((to.getTime() - from.getTime()) / 86400000 / interval) + 1;
  }
  return Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1;
}

function getMissPattern(log: string[], from: Date, to: Date) {
  const dates = log
    .filter((d) => inWindow(d, from, to))
    .map((d) => startOfDay(new Date(d)))
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length < 2) return { longestGap: 0, missedAfterStreak: 0 };

  let longestGap = 0;
  let cur = 1;
  let missedAfterStreak = 0;
  for (let i = 1; i < dates.length; i++) {
    const gap = (dates[i].getTime() - dates[i - 1].getTime()) / 86400000;
    longestGap = Math.max(longestGap, gap);
    if (gap === 1) {
      cur++;
    } else {
      if (cur >= 3) missedAfterStreak++;
      cur = 1;
    }
  }
  return { longestGap: Math.round(longestGap), missedAfterStreak };
}

function getDowBreakdown(log: string[], from: Date, to: Date) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of log) {
    if (inWindow(d, from, to)) counts[new Date(d).getDay()]++;
  }
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return [1, 2, 3, 4, 5, 6, 0].map((i) => ({ day: labels[i], count: counts[i] }));
}

// ─── tasks tab ────────────────────────────────────────────────────────────────

interface DeadlineStats {
  pct: number;
  avgLateness: number;
  hist: { label: string; count: number; isLate: boolean }[];
  total: number;
}

interface HoursStats {
  totalH: number;
  catData: { name: string; hours: number }[];
  trendData: { label: string; hours: number }[];
}

interface EstimationStats {
  med: number;
  avg: number;
  pctLonger: number;
  hist: { label: string; count: number; isOver: boolean }[];
  timerlessCount: number;
  total: number;
}

interface ConsistencyStats {
  calDays: { date: Date; count: number; habitCount: number }[];
  streak: number;
  activeDays: number;
}

function TasksTab({
  deadlineStats,
  hoursStats,
  estimationStats,
  consistencyStats,
  windowLabel,
}: {
  deadlineStats: DeadlineStats | null;
  hoursStats: HoursStats;
  estimationStats: EstimationStats | null;
  consistencyStats: ConsistencyStats;
  windowLabel: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Deadline Adherence */}
      <section style={CARD}>
        <div style={SECTION_TITLE}>Deadline Adherence · {windowLabel}</div>
        {!deadlineStats ? (
          <EmptyState text="Complete tasks with deadlines in this window to see adherence data." />
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
                <BarChart
                  data={deadlineStats.hist}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'var(--t2)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--t2)' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {deadlineStats.hist.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.isLate ? ERR : OK}
                        opacity={entry.count === 0 ? 0.2 : 0.85}
                      />
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

      {/* 2. Hours Completed */}
      <section style={CARD}>
        <div style={SECTION_TITLE}>Hours Completed · {windowLabel}</div>
        <div style={{ display: 'flex', gap: 32, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatBlock value={`${hoursStats.totalH}h`} label="total time tracked" />
          <StatBlock value={`${hoursStats.catData.length}`} label="categories" />
        </div>

        {hoursStats.trendData.some((w) => w.hours > 0) ? (
          <>
            <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 8 }}>
              Trend · {windowLabel}
            </div>
            <div style={{ height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={hoursStats.trendData}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'var(--t2)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--t2)' }}
                    axisLine={false}
                    tickLine={false}
                  />
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
            <div style={{ fontSize: 11, color: 'var(--t2)', margin: '16px 0 8px' }}>
              By category
            </div>
            <div style={{ height: Math.max(80, hoursStats.catData.length * 28) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={hoursStats.catData}
                  margin={{ top: 0, right: 40, left: 4, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: 'var(--t2)' }}
                    axisLine={false}
                    tickLine={false}
                  />
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

      {/* 3. Estimation Accuracy */}
      <section style={CARD}>
        <div style={SECTION_TITLE}>Estimation Accuracy · {windowLabel}</div>
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
                <BarChart
                  data={estimationStats.hist}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: 'var(--t2)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--t2)' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {estimationStats.hist.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.isOver ? WARN : ACCENT}
                        opacity={entry.count === 0 ? 0.2 : 0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 10, color: 'var(--t2)', marginTop: 4 }}>
              Blue = faster than estimated · Yellow = slower · Based on {estimationStats.total}{' '}
              timed tasks
              {estimationStats.timerlessCount > 0 &&
                ` · ${estimationStats.timerlessCount} tasks excluded (no timer)`}
            </div>
          </>
        )}
      </section>

      {/* 4. Consistency */}
      <section style={CARD}>
        <div style={SECTION_TITLE}>Consistency · {windowLabel}</div>
        <div style={{ display: 'flex', gap: 32, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatBlock
            value={`${consistencyStats.streak}`}
            label="current day streak"
            color={
              consistencyStats.streak >= 7
                ? OK
                : consistencyStats.streak >= 3
                ? WARN
                : 'var(--t1)'
            }
          />
          <StatBlock
            value={`${consistencyStats.activeDays}`}
            label={`active days (${windowLabel.toLowerCase()})`}
          />
        </div>
        <CalendarHeatmap days={consistencyStats.calDays} windowLabel={windowLabel} />
      </section>
    </div>
  );
}

// ─── habits tab ───────────────────────────────────────────────────────────────

interface HabitStat {
  habit: Habit;
  streaks: { current: number; best: number; avgLength: number };
  expected: number;
  actual: number;
  rate: number;
  miss: { longestGap: number; missedAfterStreak: number };
  dow: { day: string; count: number }[];
}

function HabitCard({ stat, windowLabel }: { stat: HabitStat; windowLabel: string }) {
  const { habit, streaks, expected, actual, rate, miss, dow } = stat;
  const [expanded, setExpanded] = useState(false);

  const freqLabel =
    habit.frequency === 'daily'
      ? 'Daily'
      : habit.frequency === 'weekly'
      ? `Weekly (${(habit.customDays ?? []).map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')})`
      : `Every ${habit.customDays?.[0] ?? '?'} days`;

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
      }}
    >
      {/* header row */}
      <button
        onClick={() => setExpanded((x) => !x)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          background: 'var(--bg-1)',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--t1)' }}>{habit.title}</div>
          <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>{freqLabel}</div>
        </div>

        {/* mini stats */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: rate >= 80 ? OK : rate >= 50 ? WARN : ERR,
                lineHeight: 1,
              }}
            >
              {rate}%
            </div>
            <div style={{ fontSize: 10, color: 'var(--t2)' }}>
              {actual}/{expected}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', lineHeight: 1 }}>
              {streaks.current}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t2)' }}>streak</div>
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--t2)',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s',
            }}
          >
            ▾
          </div>
        </div>
      </button>

      {/* expanded detail */}
      {expanded && (
        <div
          style={{
            padding: '0 16px 16px',
            background: 'var(--bg-1)',
            borderTop: '1px solid var(--border)',
          }}
        >
          {/* streak stats */}
          <div
            style={{
              display: 'flex',
              gap: 24,
              padding: '14px 0 16px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', lineHeight: 1 }}>
                {streaks.current}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 3 }}>current streak</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: HABIT_CLR,
                  lineHeight: 1,
                }}
              >
                {streaks.best}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 3 }}>best streak ever</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', lineHeight: 1 }}>
                {streaks.avgLength}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 3 }}>avg streak</div>
            </div>
            {miss.longestGap > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: miss.longestGap >= 7 ? ERR : WARN,
                    lineHeight: 1,
                  }}
                >
                  {miss.longestGap}d
                </div>
                <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 3 }}>
                  longest gap ({windowLabel.toLowerCase()})
                </div>
              </div>
            )}
            {miss.missedAfterStreak > 0 && (
              <div>
                <div
                  style={{ fontSize: 22, fontWeight: 700, color: WARN, lineHeight: 1 }}
                >
                  {miss.missedAfterStreak}×
                </div>
                <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 3 }}>
                  broke ≥3-day streak
                </div>
              </div>
            )}
          </div>

          {/* day-of-week bar chart */}
          <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 8 }}>
            Day-of-week breakdown · {windowLabel}
          </div>
          <div style={{ height: 100 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dow} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: 'var(--t2)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--t2)' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" fill={HABIT_CLR} opacity={0.85} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function HabitsTab({
  habits,
  habitStats,
  from,
  to,
  windowLabel,
}: {
  habits: Habit[];
  habitStats: HabitStat[];
  from: Date;
  to: Date;
  windowLabel: string;
}) {
  if (!habits.length) {
    return (
      <EmptyState text="No habits yet. Add habits on the Habits page to see statistics here." />
    );
  }

  // aggregate stats across all habits in window
  const totalCompletions = habitStats.reduce((s, h) => s + h.actual, 0);
  const avgRate = Math.round(mean(habitStats.map((h) => h.rate)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* overview card */}
      <section style={CARD}>
        <div style={SECTION_TITLE}>Habit Overview · {windowLabel}</div>
        <div style={{ display: 'flex', gap: 32, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatBlock
            value={`${avgRate}%`}
            label="avg completion rate"
            color={avgRate >= 80 ? OK : avgRate >= 50 ? WARN : ERR}
          />
          <StatBlock value={`${totalCompletions}`} label="total completions" />
          <StatBlock value={`${habits.length}`} label="habits tracked" />
        </div>

        {/* combined heatmap */}
        <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 10 }}>
          Daily completions · {windowLabel}
        </div>
        <HabitHeatmap habits={habits} from={from} to={to} />
      </section>

      {/* per-habit cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {habitStats
          .slice()
          .sort((a, b) => b.rate - a.rate)
          .map((stat) => (
            <HabitCard key={stat.habit.id} stat={stat} windowLabel={windowLabel} />
          ))}
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<TimerSession[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);

  const [windowPreset, setWindowPreset] = useState<WindowPreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [activeTab, setActiveTab] = useState<'tasks' | 'habits'>('tasks');

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

  // resolve window to { from, to }
  const { from, to } = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    if (windowPreset === '7d') return { from: startOfDay(addDays(now, -6)), to: end };
    if (windowPreset === '30d') return { from: startOfDay(addDays(now, -29)), to: end };
    if (windowPreset === '90d') return { from: startOfDay(addDays(now, -89)), to: end };
    if (windowPreset === '1y') return { from: startOfDay(addDays(now, -364)), to: end };
    if (windowPreset === 'all') return { from: new Date(0), to: end };
    if (windowPreset === 'custom' && customFrom && customTo) {
      const t2 = new Date(customTo);
      t2.setHours(23, 59, 59, 999);
      return { from: startOfDay(new Date(customFrom)), to: t2 };
    }
    return { from: startOfDay(addDays(now, -29)), to: end };
  }, [windowPreset, customFrom, customTo]);

  const windowLabel = useMemo(() => {
    if (windowPreset === '7d') return 'Last 7 days';
    if (windowPreset === '30d') return 'Last 30 days';
    if (windowPreset === '90d') return 'Last 90 days';
    if (windowPreset === '1y') return 'Last 365 days';
    if (windowPreset === 'all') return 'All time';
    if (customFrom && customTo) return `${customFrom} – ${customTo}`;
    return 'Custom range';
  }, [windowPreset, customFrom, customTo]);

  // ── deadline adherence ───────────────────────────────────────────────────
  const deadlineStats = useMemo((): DeadlineStats | null => {
    const eligible = tasks.filter(
      (t) => t.status === 'done' && t.deadline && t.completedAt && inWindow(t.completedAt, from, to),
    );
    if (!eligible.length) return null;

    const diffs = eligible.map(
      (t) => (new Date(t.completedAt!).getTime() - new Date(t.deadline!).getTime()) / 3.6e6,
    );
    const onTime = diffs.filter((d) => d <= 0).length;
    const buckets = [
      { label: '< −48h', min: -Infinity, max: -48 },
      { label: '−48–24h', min: -48, max: -24 },
      { label: '−24–0h', min: -24, max: 0 },
      { label: '0–24h', min: 0, max: 24 },
      { label: '24–48h', min: 24, max: 48 },
      { label: '> 48h', min: 48, max: Infinity },
    ];
    return {
      pct: Math.round((onTime / diffs.length) * 100),
      avgLateness: mean(diffs),
      hist: buckets.map((b) => ({
        label: b.label,
        count: diffs.filter((d) => d >= b.min && d < b.max).length,
        isLate: b.min >= 0,
      })),
      total: eligible.length,
    };
  }, [tasks, from, to]);

  // ── hours completed ───────────────────────────────────────────────────────
  const hoursStats = useMemo((): HoursStats => {
    const completed = sessions.filter((s) => s.endedAt && inWindow(s.startedAt, from, to));
    const totalMs = completed.reduce((a, s) => a + sessionDurationMs(s), 0);

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

    const windowDays = Math.ceil((to.getTime() - from.getTime()) / 86400000);
    let trendData: { label: string; hours: number }[] = [];

    if (windowDays <= 14) {
      for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
        const dayStart = startOfDay(d);
        const dayEnd = addDays(dayStart, 1);
        const h = completed
          .filter((s) => {
            const sd = new Date(s.startedAt);
            return sd >= dayStart && sd < dayEnd;
          })
          .reduce((a, s) => a + sessionDurationMs(s) / 3.6e6, 0);
        trendData.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, hours: +h.toFixed(2) });
      }
    } else if (windowDays <= 180) {
      let cursor = startOfDay(from);
      const dw = cursor.getDay();
      cursor = addDays(cursor, dw === 0 ? -6 : 1 - dw);
      while (cursor <= to) {
        const weekEnd = addDays(cursor, 7);
        const h = completed
          .filter((s) => {
            const sd = new Date(s.startedAt);
            return sd >= cursor && sd < weekEnd;
          })
          .reduce((a, s) => a + sessionDurationMs(s) / 3.6e6, 0);
        trendData.push({ label: weekLabel(cursor), hours: +h.toFixed(2) });
        cursor = weekEnd;
      }
    } else {
      let cur = new Date(from.getFullYear(), from.getMonth(), 1);
      while (cur <= to) {
        const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
        const h = completed
          .filter((s) => {
            const sd = new Date(s.startedAt);
            return sd >= cur && sd < next;
          })
          .reduce((a, s) => a + sessionDurationMs(s) / 3.6e6, 0);
        trendData.push({
          label: `${cur.getMonth() + 1}/${cur.getFullYear().toString().slice(2)}`,
          hours: +h.toFixed(2),
        });
        cur = next;
      }
    }

    return { totalH: +(totalMs / 3.6e6).toFixed(1), catData, trendData };
  }, [tasks, sessions, from, to]);

  // ── estimation accuracy ───────────────────────────────────────────────────
  const estimationStats = useMemo((): EstimationStats | null => {
    const doneTasks = tasks.filter(
      (t) => t.status === 'done' && t.effortMin > 0 && t.completedAt && inWindow(t.completedAt, from, to),
    );
    const ratios: number[] = [];
    let timerlessCount = 0;
    for (const t of doneTasks) {
      const ts = sessions.filter((s) => s.taskId === t.id && s.endedAt);
      if (!ts.length) { timerlessCount++; continue; }
      ratios.push(ts.reduce((a, s) => a + sessionDurationMs(s), 0) / 60_000 / t.effortMin);
    }
    if (!ratios.length) return null;
    const med = median(ratios);
    const avg = mean(ratios);
    const buckets = [
      { label: '< 0.5×', min: 0, max: 0.5 },
      { label: '0.5–0.75×', min: 0.5, max: 0.75 },
      { label: '0.75–1×', min: 0.75, max: 1 },
      { label: '1–1.25×', min: 1, max: 1.25 },
      { label: '1.25–1.5×', min: 1.25, max: 1.5 },
      { label: '1.5–2×', min: 1.5, max: 2 },
      { label: '> 2×', min: 2, max: Infinity },
    ];
    return {
      med: +med.toFixed(2),
      avg: +avg.toFixed(2),
      pctLonger: Math.round((avg - 1) * 100),
      hist: buckets.map((b) => ({
        label: b.label,
        count: ratios.filter((r) => r >= b.min && r < b.max).length,
        isOver: b.min >= 1,
      })),
      timerlessCount,
      total: ratios.length,
    };
  }, [tasks, sessions, from, to]);

  // ── consistency ───────────────────────────────────────────────────────────
  const consistencyStats = useMemo((): ConsistencyStats => {
    const today = startOfDay(new Date());

    const doneTasks = tasks.filter(
      (t) => t.status === 'done' && t.completedAt && inWindow(t.completedAt, from, to),
    );
    const completionDays = new Set(
      doneTasks.map((t) => startOfDay(new Date(t.completedAt!)).getTime()),
    );

    const habitByDay = new Map<number, number>();
    for (const h of habits) {
      for (const d of h.completionLog) {
        if (inWindow(d, from, to)) {
          const ts = startOfDay(new Date(d)).getTime();
          habitByDay.set(ts, (habitByDay.get(ts) ?? 0) + 1);
        }
      }
    }

    const calDays: { date: Date; count: number; habitCount: number }[] = [];
    const windowEnd = to < today ? to : today;
    for (let d = new Date(from); d <= windowEnd; d = addDays(d, 1)) {
      const ts = startOfDay(d).getTime();
      calDays.push({
        date: new Date(ts),
        count: doneTasks.filter((t) => startOfDay(new Date(t.completedAt!)).getTime() === ts).length,
        habitCount: habitByDay.get(ts) ?? 0,
      });
    }

    const allActivity = new Set([...completionDays, ...[...habitByDay.keys()]]);
    let streak = 0;
    let cursor = today;
    while (allActivity.has(cursor.getTime())) {
      streak++;
      cursor = startOfDay(addDays(cursor, -1));
    }

    return { calDays, streak, activeDays: allActivity.size };
  }, [tasks, habits, from, to]);

  // ── habit stats ───────────────────────────────────────────────────────────
  const habitStats = useMemo((): HabitStat[] => {
    return habits.map((h) => ({
      habit: h,
      streaks: computeStreaks(h.completionLog),
      expected: expectedOccurrences(h, from, to),
      actual: h.completionLog.filter((d) => inWindow(d, from, to)).length,
      rate:
        expectedOccurrences(h, from, to) > 0
          ? Math.min(
              100,
              Math.round(
                (h.completionLog.filter((d) => inWindow(d, from, to)).length /
                  expectedOccurrences(h, from, to)) *
                  100,
              ),
            )
          : 0,
      miss: getMissPattern(h.completionLog, from, to),
      dow: getDowBreakdown(h.completionLog, from, to),
    }));
  }, [habits, from, to]);

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--t2)', fontSize: 13 }}>Loading…</div>;
  }

  const doneTasks = tasks.filter((t) => t.status === 'done');

  return (
    <div style={{ padding: '16px 16px 32px', maxWidth: 800, margin: '0 auto' }}>
      {/* header */}
      <div style={{ marginBottom: 16 }}>
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
          {doneTasks.length} tasks completed · {sessions.filter((s) => s.endedAt).length} timer
          sessions · {habits.length} habits
        </div>
      </div>

      {/* time window selector */}
      <WindowSelector
        preset={windowPreset}
        onPreset={setWindowPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFrom={setCustomFrom}
        onCustomTo={setCustomTo}
      />

      {/* tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          marginBottom: 20,
        }}
      >
        {(['tasks', 'habits'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              color: activeTab === tab ? 'var(--t1)' : 'var(--t2)',
              borderBottom: activeTab === tab ? `2px solid ${ACCENT}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {tab === 'tasks' ? 'Tasks' : `Habits (${habits.length})`}
          </button>
        ))}
      </div>

      {activeTab === 'tasks' ? (
        <TasksTab
          deadlineStats={deadlineStats}
          hoursStats={hoursStats}
          estimationStats={estimationStats}
          consistencyStats={consistencyStats}
          windowLabel={windowLabel}
        />
      ) : (
        <HabitsTab
          habits={habits}
          habitStats={habitStats}
          from={from}
          to={to}
          windowLabel={windowLabel}
        />
      )}
    </div>
  );
}
