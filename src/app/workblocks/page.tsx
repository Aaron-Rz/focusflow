'use client';

import { useEffect, useState } from 'react';
import { useTaskStore } from '@/stores/taskStore';
import { useWorkblockStore } from '@/stores/workblockStore';
import { fillWorkblock, workblockToIcs } from '@/lib/scheduling/workblocks';
import type { Workblock } from '@/types';

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function downloadIcs(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WorkblocksPage() {
  const { tasks, loading: tasksLoading, loadTasks } = useTaskStore();
  const { workblocks, loading: wbLoading, loadWorkblocks, addWorkblock, deleteWorkblock } = useWorkblockStore();

  // Form state
  const now = new Date();
  const roundedNow = new Date(Math.ceil(now.getTime() / 60_000) * 60_000);
  const oneHourLater = new Date(roundedNow.getTime() + 60 * 60_000);

  const [start, setStart] = useState(toLocalDatetimeValue(roundedNow));
  const [end, setEnd] = useState(toLocalDatetimeValue(oneHourLater));
  const [onOverrun, setOnOverrun] = useState<Workblock['onOverrun']>('abortTask');
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
    setSubmitting(true);
    await addWorkblock({ start: startDate.toISOString(), end: endDate.toISOString(), onOverrun });
    setSubmitting(false);
  };

  const loading = tasksLoading || wbLoading;

  return (
    <div className="max-w-2xl mx-auto p-4 font-mono">
      <div className="flex items-center gap-3 mb-6">
        <a href="/" className="text-sm text-blue-500 hover:underline">← Tasks</a>
        <h1 className="text-2xl font-bold">Workblocks</h1>
      </div>

      {/* Create form */}
      <form
        onSubmit={handleCreate}
        className="border border-gray-300 rounded p-4 mb-8 space-y-3"
      >
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
                <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                  <div>
                    <div className="font-semibold text-sm">
                      {new Date(wb.start).toLocaleString()} – {new Date(wb.end).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatDuration(blockMin)} block ·{' '}
                      {wb.onOverrun === 'abortTask' ? 'abort task on overrun' : 'extend block on overrun'} ·{' '}
                      {filled.filledTasks.length} task{filled.filledTasks.length !== 1 ? 's' : ''} ·{' '}
                      {formatDuration(Math.round(usedMin))} used
                      {filled.remainingMinutes > 0 && ` · ${formatDuration(Math.round(filled.remainingMinutes))} free`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const ics = workblockToIcs(filled);
                        downloadIcs(ics, `workblock-${wb.id.slice(0, 8)}.ics`);
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

                {filled.filledTasks.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No ready tasks fit this block.</p>
                ) : (
                  <ol className="space-y-1">
                    {filled.filledTasks.map((task, i) => (
                      <li key={task.id} className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400 w-5 text-right flex-shrink-0">{i + 1}.</span>
                        <span className="flex-1 truncate">{task.title}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{task.effortMin}m</span>
                        {task.deadline && (
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            due {new Date(task.deadline).toLocaleDateString()}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
      </ul>
    </div>
  );
}
