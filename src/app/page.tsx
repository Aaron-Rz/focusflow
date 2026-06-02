'use client';

import { useEffect, useState } from 'react';
import { useTaskStore } from '@/stores/taskStore';
import { rankTasks } from '@/lib/algorithm/score';
import type { Importance, CogLoad, Task } from '@/types';

const IMPORTANCE_LABELS: Record<number, string> = { 1: '1-Low', 2: '2-Medium', 3: '3-High', 4: '4-Critical' };
const COGLOAD_LABELS: Record<number, string> = { 1: '1-Light', 2: '2-Moderate', 3: '3-Heavy' };

export default function Home() {
  const { tasks, loading, loadTasks, addTask, markDone, markOpen, setDependency } = useTaskStore();
  const [depError, setDepError] = useState('');

  const [title, setTitle] = useState('');
  const [effortMin, setEffortMin] = useState(30);
  const [importance, setImportance] = useState<Importance>(2);
  const [cogLoad, setCogLoad] = useState<CogLoad>(2);
  const [deadline, setDeadline] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    await addTask({
      title: title.trim(),
      effortMin,
      importance,
      cogLoad,
      deadline: deadline || undefined,
      category: category.trim() || undefined,
    });
    setTitle('');
    setEffortMin(30);
    setImportance(2);
    setCogLoad(2);
    setDeadline('');
    setCategory('');
    setSubmitting(false);
  };

  const now = new Date();

  // Build a lookup map for dependency status
  const taskById = new Map<string, Task>(tasks.map(t => [t.id, t]));

  // An open task is "ready" iff it has no predecessor, or the predecessor is done.
  // A dangling predecessor (missing/deleted) is treated as ready.
  const isTaskReady = (t: Task) => {
    if (!t.dependsOnId) return true;
    const dep = taskById.get(t.dependsOnId);
    return !dep || dep.status === 'done';
  };

  const openTasks = tasks.filter(t => t.status !== 'done');
  const readyTasks = openTasks.filter(isTaskReady);
  const blockedTasks = openTasks.filter(t => !isTaskReady(t));
  const doneTasks = tasks.filter(t => t.status === 'done');

  const ranked = rankTasks(readyTasks, now);

  const handleSetDependency = async (taskId: string, value: string) => {
    setDepError('');
    const err = await setDependency(taskId, value || undefined);
    if (err) setDepError(err);
  };

  // Options for the dependency dropdown of a given task: any other task except itself.
  const depOptionsFor = (taskId: string) =>
    tasks.filter(t => t.id !== taskId);

  return (
    <div className="max-w-2xl mx-auto p-4 font-mono">
      <h1 className="text-2xl font-bold mb-6">FocusFlow</h1>

      {/* Add Task Form */}
      <form onSubmit={handleSubmit} className="border border-gray-300 rounded p-4 mb-8 space-y-3">
        <h2 className="font-semibold text-lg">New Task</h2>

        <div>
          <label className="block text-sm mb-1">Title *</label>
          <input
            className="border border-gray-300 rounded px-2 py-1 w-full"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Task title"
            required
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm mb-1">Effort (min) *</label>
            <input
              type="number"
              min={1}
              className="border border-gray-300 rounded px-2 py-1 w-full"
              value={effortMin}
              onChange={e => setEffortMin(Number(e.target.value))}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm mb-1">Importance *</label>
            <select
              className="border border-gray-300 rounded px-2 py-1 w-full"
              value={importance}
              onChange={e => setImportance(Number(e.target.value) as Importance)}
            >
              {([1, 2, 3, 4] as Importance[]).map(v => (
                <option key={v} value={v}>{IMPORTANCE_LABELS[v]}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm mb-1">Cog Load *</label>
            <select
              className="border border-gray-300 rounded px-2 py-1 w-full"
              value={cogLoad}
              onChange={e => setCogLoad(Number(e.target.value) as CogLoad)}
            >
              {([1, 2, 3] as CogLoad[]).map(v => (
                <option key={v} value={v}>{COGLOAD_LABELS[v]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm mb-1">Deadline (optional)</label>
            <input
              type="datetime-local"
              className="border border-gray-300 rounded px-2 py-1 w-full"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm mb-1">Category (optional)</label>
            <input
              className="border border-gray-300 rounded px-2 py-1 w-full"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="e.g. Work, Personal"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
        >
          {submitting ? 'Adding…' : 'Add Task'}
        </button>
      </form>

      {depError && (
        <div className="mb-4 border border-red-300 bg-red-50 text-red-700 text-sm rounded px-3 py-2">
          {depError}
        </div>
      )}

      {/* Ranked Task List */}
      <section>
        <h2 className="font-semibold text-lg mb-3">
          Ready Tasks ({ranked.length})
        </h2>
        {loading && <p className="text-gray-500">Loading…</p>}
        {!loading && ranked.length === 0 && (
          <p className="text-gray-500">No ready tasks. Add one above.</p>
        )}
        <ul className="space-y-2">
          {ranked.map(({ task, score, isAtRisk, isOverdue }) => (
            <li
              key={task.id}
              className="border border-gray-200 rounded p-3 flex items-start gap-3"
            >
              <input
                type="checkbox"
                className="mt-1 w-4 h-4 cursor-pointer"
                checked={false}
                onChange={() => markDone(task.id)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{task.title}</span>
                  {isOverdue && (
                    <span className="text-xs bg-red-100 text-red-700 px-1 rounded">OVERDUE</span>
                  )}
                  {isAtRisk && !isOverdue && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-1 rounded">AT RISK</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1 space-x-3">
                  <span>score: <strong>{score.toFixed(2)}</strong></span>
                  <span>effort: {task.effortMin}m</span>
                  <span>imp: {task.importance}</span>
                  <span>cog: {task.cogLoad}</span>
                  {task.category && <span>#{task.category}</span>}
                  {task.deadline && (
                    <span>due: {new Date(task.deadline).toLocaleString()}</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                  <label>depends on:</label>
                  <select
                    className="border border-gray-300 rounded px-1 py-0.5"
                    value={task.dependsOnId ?? ''}
                    onChange={e => handleSetDependency(task.id, e.target.value)}
                  >
                    <option value="">— none —</option>
                    {depOptionsFor(task.id).map(o => (
                      <option key={o.id} value={o.id}>{o.title}</option>
                    ))}
                  </select>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Blocked Tasks (predecessor not yet done) */}
      {blockedTasks.length > 0 && (
        <section className="mt-8">
          <h2 className="font-semibold text-lg mb-3 text-gray-400">
            Blocked ({blockedTasks.length})
          </h2>
          <ul className="space-y-2">
            {blockedTasks.map(task => {
              const dep = taskById.get(task.dependsOnId!);
              return (
                <li
                  key={task.id}
                  className="border border-gray-200 rounded p-3 opacity-50"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{task.title}</span>
                    <span className="text-xs bg-gray-200 text-gray-600 px-1 rounded">
                      BLOCKED
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    waiting on: {dep ? dep.title : 'unknown task'}
                  </div>
                  <div className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                    <label>depends on:</label>
                    <select
                      className="border border-gray-300 rounded px-1 py-0.5"
                      value={task.dependsOnId ?? ''}
                      onChange={e => handleSetDependency(task.id, e.target.value)}
                    >
                      <option value="">— none —</option>
                      {depOptionsFor(task.id).map(o => (
                        <option key={o.id} value={o.id}>{o.title}</option>
                      ))}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Done Tasks */}
      {doneTasks.length > 0 && (
        <section className="mt-8">
          <h2 className="font-semibold text-lg mb-3 text-gray-400">
            Done ({doneTasks.length})
          </h2>
          <ul className="space-y-1">
            {doneTasks.map(task => (
              <li key={task.id} className="flex items-center gap-2 text-gray-400">
                <input
                  type="checkbox"
                  className="w-4 h-4 cursor-pointer"
                  checked
                  onChange={() => markOpen(task.id)}
                />
                <span className="line-through text-sm">{task.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
