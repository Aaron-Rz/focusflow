'use client';

import { useEffect, useState } from 'react';
import { useTaskStore } from '@/stores/taskStore';
import { useWorkblockStore } from '@/stores/workblockStore';
import { fillWorkblock, workblockToIcs } from '@/lib/scheduling/workblocks';
import type { Workblock, ScheduleSegment, Task } from '@/types';
import { downloadFile } from '@/lib/utils/download';
import { getDistinctCategories } from '@/lib/utils/categories';

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

function SegmentList({ segments, taskMap }: { segments: ScheduleSegment[]; taskMap: Map<string, Task> }) {
  if (segments.length === 0) {
    return <p className="text-xs text-gray-400 italic">No ready tasks fit this block.</p>;
  }

  return (
    <ol className="space-y-0.5 text-sm">
      {segments.map((seg, i) => {
        if (seg.type === 'break') {
          return (
            <li key={i} className="flex items-center gap-2 text-xs text-gray-400 py-0.5">
              <span className="w-28 flex-shrink-0 tabular-nums">
                {fmtTime(seg.start)}–{fmtTime(seg.end)}
              </span>
              <span className="italic">☕ Break ({formatDuration((seg.end.getTime() - seg.start.getTime()) / 60_000)})</span>
            </li>
          );
        }
        const task = seg.taskId ? taskMap.get(seg.taskId) : undefined;
        const durMin = (seg.end.getTime() - seg.start.getTime()) / 60_000;
        return (
          <li key={i} className="flex items-center gap-2">
            <span className="w-28 flex-shrink-0 tabular-nums text-xs text-gray-500">
              {fmtTime(seg.start)}–{fmtTime(seg.end)}
            </span>
            <span className="flex-1 truncate">
              {task?.title ?? '(unknown)'}
              {seg.isContinuation && (
                <span className="ml-1 text-xs text-blue-500">(cont.)</span>
              )}
            </span>
            <span className="text-xs text-gray-400 flex-shrink-0">{formatDuration(durMin)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function WorkblocksPage() {
  const { tasks, loading: tasksLoading, loadTasks } = useTaskStore();
  const { workblocks, loading: wbLoading, loadWorkblocks, addWorkblock, deleteWorkblock } =
    useWorkblockStore();

  // Form state
  const now = new Date();
  const roundedNow = new Date(Math.ceil(now.getTime() / 60_000) * 60_000);
  const oneHourLater = new Date(roundedNow.getTime() + 60 * 60_000);

  const [start, setStart] = useState(toLocalDatetimeValue(roundedNow));
  const [end, setEnd] = useState(toLocalDatetimeValue(oneHourLater));
  const [onOverrun, setOnOverrun] = useState<Workblock['onOverrun']>('abortTask');
  const [pomodoroEnabled, setPomodoroEnabled] = useState(false);
  const [pomodoroWorkMin, setPomodoroWorkMin] = useState(25);
  const [pomodoroBreakMin, setPomodoroBreakMin] = useState(5);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadTasks();
    loadWorkblocks();
  }, [loadTasks, loadWorkblocks]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const startDate = new Date(start);
    const endDate = new Date(end);
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
      pomodoroEnabled,
      pomodoroWorkMin: pomodoroEnabled ? pomodoroWorkMin : undefined,
      pomodoroBreakMin: pomodoroEnabled ? pomodoroBreakMin : undefined,
    });
    setSubmitting(false);
  };

  const loading = tasksLoading || wbLoading;

  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  return (
    <div className="max-w-2xl mx-auto p-4 font-mono">
      <div className="flex items-center gap-3 mb-6">
        <a href="/" className="text-sm text-blue-500 hover:underline">← Tasks</a>
        <h1 className="text-2xl font-bold">Workblocks</h1>
      </div>

      {/* Create form */}
      <form onSubmit={handleCreate} className="border border-gray-300 rounded p-4 mb-8 space-y-3">
        <h2 className="font-semibold text-lg">New Workblock</h2>
        {formError && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
            {formError}
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="block text-xs mb-0.5">Start</label>
            <input
              type="datetime-local"
              className="border border-gray-300 rounded px-2 py-1 w-full text-sm"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs mb-0.5">End</label>
            <input
              type="datetime-local"
              className="border border-gray-300 rounded px-2 py-1 w-full text-sm"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs mb-0.5">On overrun</label>
          <select
            className="border border-gray-300 rounded px-2 py-1 text-sm"
            value={onOverrun}
            onChange={(e) => setOnOverrun(e.target.value as Workblock['onOverrun'])}
          >
            <option value="abortTask">Abort task at block end</option>
            <option value="extendBlock">Extend block until task finishes</option>
          </select>
        </div>

        {/* Category filter */}
        {(() => {
          const cats = getDistinctCategories(tasks);
          if (cats.length === 0) return null;
          return (
            <div>
              <label className="block text-xs mb-1">Include only these categories (leave empty for all)</label>
              <div className="flex flex-wrap gap-1.5">
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
                      className={`px-2 py-0.5 rounded text-xs border ${
                        active
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                      }`}
                    >
                      #{cat}
                    </button>
                  );
                })}
                {categoryFilter.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCategoryFilter([])}
                    className="px-2 py-0.5 rounded text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    clear
                  </button>
                )}
              </div>
              {categoryFilter.length > 0 && (
                <p className="text-xs text-indigo-600 mt-1">
                  Only tasks in: {categoryFilter.map((c) => `#${c}`).join(', ')}
                </p>
              )}
            </div>
          );
        })()}

        {/* Pomodoro settings */}
        <div className="border border-gray-200 rounded p-3 space-y-2 bg-gray-50">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pomodoroEnabled}
              onChange={(e) => setPomodoroEnabled(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium">Pomodoro mode</span>
          </label>
          {pomodoroEnabled && (
            <div className="flex gap-3 flex-wrap pl-6">
              <label className="flex items-center gap-1 text-xs">
                Work
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={pomodoroWorkMin}
                  onChange={(e) => setPomodoroWorkMin(Number(e.target.value))}
                  className="border border-gray-300 rounded px-1.5 py-0.5 w-14 text-sm"
                />
                min
              </label>
              <label className="flex items-center gap-1 text-xs">
                Break
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={pomodoroBreakMin}
                  onChange={(e) => setPomodoroBreakMin(Number(e.target.value))}
                  className="border border-gray-300 rounded px-1.5 py-0.5 w-14 text-sm"
                />
                min
              </label>
              <span className="text-xs text-gray-400 self-center">
                Tasks split across breaks; onOverrun applies only at the outer block end.
              </span>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white rounded px-3 py-1 text-sm disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create & Auto-fill'}
        </button>
      </form>

      {loading && <p className="text-gray-500">Loading…</p>}
      {!loading && workblocks.length === 0 && (
        <p className="text-gray-500">No workblocks yet.</p>
      )}

      {/* Workblock list */}
      <ul className="space-y-6">
        {workblocks
          .slice()
          .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
          .map((wb) => {
            const filled = fillWorkblock(wb, tasks, new Date());
            const blockMin = (new Date(wb.end).getTime() - new Date(wb.start).getTime()) / 60_000;
            const usedMin = blockMin - filled.remainingMinutes;

            return (
              <li key={wb.id} className="border border-gray-200 rounded p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
                  <div>
                    <div className="font-semibold text-sm">
                      {new Date(wb.start).toLocaleString()} – {new Date(wb.end).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
                      <span>{formatDuration(blockMin)} block</span>
                      <span>·</span>
                      <span>{wb.onOverrun === 'abortTask' ? 'abort on overrun' : 'extend on overrun'}</span>
                      {wb.categoryFilter && wb.categoryFilter.length > 0 && (
                        <>
                          <span>·</span>
                          <span>{wb.categoryFilter.map((c) => `#${c}`).join(' ')}</span>
                        </>
                      )}
                      {wb.pomodoroEnabled && (
                        <>
                          <span>·</span>
                          <span>🍅 {wb.pomodoroWorkMin ?? 25}/{wb.pomodoroBreakMin ?? 5}m</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{filled.filledTasks.length} task{filled.filledTasks.length !== 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span>{formatDuration(Math.round(usedMin))} used</span>
                      {filled.remainingMinutes > 0.5 && (
                        <>
                          <span>·</span>
                          <span>{formatDuration(Math.round(filled.remainingMinutes))} free</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const ics = workblockToIcs(filled, taskMap);
                        downloadFile(ics, `workblock-${wb.id.slice(0, 8)}.ics`, 'text/calendar;charset=utf-8');
                      }}
                      className="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded px-2 py-1"
                    >
                      Export .ics
                    </button>
                    <button
                      onClick={() => deleteWorkblock(wb.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <SegmentList segments={filled.segments} taskMap={taskMap} />
              </li>
            );
          })}
      </ul>
    </div>
  );
}
