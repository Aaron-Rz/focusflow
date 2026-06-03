'use client';

import { useEffect, useState } from 'react';
import { useTaskStore, getTaskDepth } from '@/stores/taskStore';
import { rankTasks } from '@/lib/algorithm/score';
import { effectiveEffortMin } from '@/lib/algorithm/dependencies';
import type { Importance, CogLoad, Task } from '@/types';

const IMP_LABELS: Record<number, string> = { 1: '1-Low', 2: '2-Med', 3: '3-High', 4: '4-Crit' };
const CL_LABELS: Record<number, string> = { 1: '1-Light', 2: '2-Mod', 3: '3-Heavy' };

interface AddTaskFormProps {
  parentId?: string;
  parentDepth?: number;
  tasks: Task[];
  onAdd: (input: {
    title: string;
    effortMin: number;
    importance: Importance;
    cogLoad: CogLoad;
    deadline?: string;
    category?: string;
    dependsOnId?: string;
    parentId?: string;
  }) => Promise<string | null>;
  onCancel?: () => void;
  compact?: boolean;
}

function AddTaskForm({ parentId, tasks, onAdd, onCancel, compact = false }: AddTaskFormProps) {
  const [title, setTitle] = useState('');
  const [effortMin, setEffortMin] = useState(30);
  const [importance, setImportance] = useState<Importance>(2);
  const [cogLoad, setCogLoad] = useState<CogLoad>(2);
  const [deadline, setDeadline] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // For sibling Must-Do: only siblings (same parent) are valid options
  const siblingOptions = parentId
    ? tasks.filter((t) => t.parentId === parentId)
    : tasks.filter((t) => !t.parentId);
  const [dependsOnId, setDependsOnId] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setError('');
    setSubmitting(true);
    const err = await onAdd({
      title: title.trim(),
      effortMin,
      importance,
      cogLoad,
      deadline: deadline || undefined,
      category: category.trim() || undefined,
      dependsOnId: dependsOnId || undefined,
      parentId,
    });
    setSubmitting(false);
    if (err) { setError(err); return; }
    setTitle('');
    setEffortMin(30);
    setImportance(2);
    setCogLoad(2);
    setDeadline('');
    setCategory('');
    setDependsOnId('');
    if (onCancel) onCancel();
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-2 ${compact ? 'mt-2 pl-2 border-l-2 border-blue-200' : 'border border-gray-300 rounded p-4 mb-8'}`}>
      {!compact && <h2 className="font-semibold text-lg">New Task</h2>}
      {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</div>}
      <div>
        <input
          className="border border-gray-300 rounded px-2 py-1 w-full text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={compact ? 'Subtask title…' : 'Task title'}
          required
          autoFocus={compact}
        />
      </div>
      <div className="flex gap-2 flex-wrap">
        <div>
          <label className="block text-xs mb-0.5">Effort (min)</label>
          <input
            type="number"
            min={1}
            className="border border-gray-300 rounded px-2 py-1 w-20 text-sm"
            value={effortMin}
            onChange={(e) => setEffortMin(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="block text-xs mb-0.5">Importance</label>
          <select
            className="border border-gray-300 rounded px-2 py-1 text-sm"
            value={importance}
            onChange={(e) => setImportance(Number(e.target.value) as Importance)}
          >
            {([1, 2, 3, 4] as Importance[]).map((v) => (
              <option key={v} value={v}>{IMP_LABELS[v]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-0.5">Cog Load</label>
          <select
            className="border border-gray-300 rounded px-2 py-1 text-sm"
            value={cogLoad}
            onChange={(e) => setCogLoad(Number(e.target.value) as CogLoad)}
          >
            {([1, 2, 3] as CogLoad[]).map((v) => (
              <option key={v} value={v}>{CL_LABELS[v]}</option>
            ))}
          </select>
        </div>
      </div>
      {!compact && (
        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 min-w-32">
            <label className="block text-xs mb-0.5">Deadline (optional)</label>
            <input
              type="datetime-local"
              className="border border-gray-300 rounded px-2 py-1 w-full text-sm"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-32">
            <label className="block text-xs mb-0.5">Category (optional)</label>
            <input
              className="border border-gray-300 rounded px-2 py-1 w-full text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Work"
            />
          </div>
        </div>
      )}
      {siblingOptions.length > 0 && (
        <div>
          <label className="block text-xs mb-0.5">Must-Do after (sibling)</label>
          <select
            className="border border-gray-300 rounded px-2 py-1 text-sm"
            value={dependsOnId}
            onChange={(e) => setDependsOnId(e.target.value)}
          >
            <option value="">— none —</option>
            {siblingOptions.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="bg-blue-600 text-white rounded px-3 py-1 text-sm disabled:opacity-50"
        >
          {submitting ? 'Adding…' : compact ? 'Add Subtask' : 'Add Task'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-gray-500 underline">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

interface TaskRowProps {
  task: Task;
  score: number;
  isAtRisk: boolean;
  isOverdue: boolean;
  depth: number;
  tasks: Task[];
  scoredById: Map<string, { score: number; isAtRisk: boolean; isOverdue: boolean }>;
  onDone: (id: string) => void;
  onOpen: (id: string) => void;
  onSetDep: (taskId: string, val: string) => Promise<void>;
  onAddTask: AddTaskFormProps['onAdd'];
  isBlocked: boolean;
  blockedBy?: string;
}

function TaskRow({
  task, score, isAtRisk, isOverdue, depth, tasks, scoredById,
  onDone, onOpen, onSetDep, onAddTask, isBlocked, blockedBy,
}: TaskRowProps) {
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [depError, setDepError] = useState('');

  const children = tasks
    .filter((t) => t.parentId === task.id && t.status !== 'done')
    .sort((a, b) => (scoredById.get(b.id)?.score ?? 0) - (scoredById.get(a.id)?.score ?? 0));

  const canAddSubtask = depth < 2;
  const indent = depth * 20;

  const handleSetDep = async (val: string) => {
    setDepError('');
    const err = await onSetDep(task.id, val);
    // onSetDep already shows error in parent; keep local too
    if (typeof err === 'string') setDepError(err);
  };

  // Dependency options: siblings only (same parentId)
  const siblingDepOptions = tasks.filter(
    (t) => t.id !== task.id && t.parentId === task.parentId
  );

  return (
    <li>
      <div
        className={`border rounded p-3 flex items-start gap-3 ${
          isBlocked ? 'border-gray-200 opacity-50' : 'border-gray-200'
        } ${isOverdue ? 'border-red-200 bg-red-50/30' : ''}`}
        style={{ marginLeft: indent }}
      >
        <input
          type="checkbox"
          className="mt-1 w-4 h-4 cursor-pointer flex-shrink-0"
          checked={false}
          onChange={() => onDone(task.id)}
          disabled={isBlocked}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {depth > 0 && (
              <span className="text-xs text-gray-400">{'└'.repeat(1)}</span>
            )}
            <span className={`font-medium ${depth > 0 ? 'text-sm' : ''}`}>{task.title}</span>
            {isBlocked && (
              <span className="text-xs bg-gray-200 text-gray-600 px-1 rounded">BLOCKED</span>
            )}
            {isOverdue && !isBlocked && (
              <span className="text-xs bg-red-100 text-red-700 px-1 rounded">OVERDUE</span>
            )}
            {isAtRisk && !isOverdue && !isBlocked && (
              <span className="text-xs bg-orange-100 text-orange-700 px-1 rounded">AT RISK</span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1 space-x-2 flex flex-wrap gap-y-0.5">
            <span>score: <strong>{score.toFixed(2)}</strong></span>
            <span>effort: {effectiveEffortMin(task, tasks)}m</span>
            <span>imp: {task.importance}</span>
            <span>cog: {task.cogLoad}</span>
            {task.category && <span>#{task.category}</span>}
            {task.deadline && <span>due: {new Date(task.deadline).toLocaleString()}</span>}
            {isBlocked && blockedBy && <span className="text-gray-400">waiting on: {blockedBy}</span>}
          </div>
          {siblingDepOptions.length > 0 && (
            <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <label>Must-Do after:</label>
              <select
                className="border border-gray-300 rounded px-1 py-0.5"
                value={task.dependsOnId ?? ''}
                onChange={(e) => handleSetDep(e.target.value)}
              >
                <option value="">— none —</option>
                {siblingDepOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.title}</option>
                ))}
              </select>
              {depError && <span className="text-red-600">{depError}</span>}
            </div>
          )}
          {canAddSubtask && !showSubtaskForm && (
            <button
              className="mt-1 text-xs text-blue-500 hover:underline"
              onClick={() => setShowSubtaskForm(true)}
            >
              + subtask
            </button>
          )}
          {showSubtaskForm && (
            <AddTaskForm
              parentId={task.id}
              tasks={tasks}
              onAdd={onAddTask}
              onCancel={() => setShowSubtaskForm(false)}
              compact
            />
          )}
        </div>
      </div>
      {children.length > 0 && (
        <ul className="space-y-1 mt-1">
          {children.map((child) => {
            const cs = scoredById.get(child.id);
            const childBlocked = isChildBlocked(child, tasks);
            const blockerTask = child.dependsOnId ? tasks.find((t) => t.id === child.dependsOnId) : undefined;
            return (
              <TaskRow
                key={child.id}
                task={child}
                score={cs?.score ?? 0}
                isAtRisk={cs?.isAtRisk ?? false}
                isOverdue={cs?.isOverdue ?? false}
                depth={depth + 1}
                tasks={tasks}
                scoredById={scoredById}
                onDone={onDone}
                onOpen={onOpen}
                onSetDep={onSetDep}
                onAddTask={onAddTask}
                isBlocked={childBlocked}
                blockedBy={blockerTask?.title}
              />
            );
          })}
        </ul>
      )}
    </li>
  );
}

function isChildBlocked(task: Task, allTasks: Task[]): boolean {
  if (!task.dependsOnId) return false;
  const dep = allTasks.find((t) => t.id === task.dependsOnId);
  return !!dep && dep.status !== 'done';
}

export default function Home() {
  const { tasks, loading, loadTasks, addTask, markDone, markOpen, setDependency } = useTaskStore();
  const [depError, setDepError] = useState('');

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const now = new Date();

  // Score all open tasks — substitute effective effort before ranking
  const openTasks = tasks.filter((t) => t.status !== 'done');
  const scorable = openTasks.map((t) => ({ ...t, effortMin: effectiveEffortMin(t, tasks) }));
  const ranked = rankTasks(scorable, now);
  const scoredById = new Map(
    ranked.map(({ task, score, isAtRisk, isOverdue }) => [task.id, { score, isAtRisk, isOverdue }])
  );

  // Helper: display score for a subtree rooted at taskId
  const displayScore = (taskId: string): number => {
    const own = scoredById.get(taskId)?.score ?? 0;
    const children = tasks.filter((t) => t.parentId === taskId && t.status !== 'done');
    if (children.length === 0) return own;
    return Math.max(own, ...children.flatMap((c) => {
      const cScore = scoredById.get(c.id)?.score ?? 0;
      const grandchildren = tasks.filter((t) => t.parentId === c.id && t.status !== 'done');
      return [cScore, ...grandchildren.map((g) => scoredById.get(g.id)?.score ?? 0)];
    }));
  };

  const topLevelOpen = openTasks
    .filter((t) => !t.parentId)
    .sort((a, b) => displayScore(b.id) - displayScore(a.id));

  const doneTasks = tasks.filter((t) => t.status === 'done' && !t.parentId);

  const handleSetDependency = async (taskId: string, value: string): Promise<void> => {
    setDepError('');
    const err = await setDependency(taskId, value || undefined);
    if (err) setDepError(err);
  };

  return (
    <div className="max-w-2xl mx-auto p-4 font-mono">
      <h1 className="text-2xl font-bold mb-6">FocusFlow</h1>

      <AddTaskForm tasks={tasks} onAdd={addTask} />

      {depError && (
        <div className="mb-4 border border-red-300 bg-red-50 text-red-700 text-sm rounded px-3 py-2">
          {depError}
        </div>
      )}

      <section>
        <h2 className="font-semibold text-lg mb-3">
          Open Tasks ({topLevelOpen.length})
        </h2>
        {loading && <p className="text-gray-500">Loading…</p>}
        {!loading && topLevelOpen.length === 0 && (
          <p className="text-gray-500">No tasks yet. Add one above.</p>
        )}
        <ul className="space-y-2">
          {topLevelOpen.map((task) => {
            const s = scoredById.get(task.id);
            const blocked = isChildBlocked(task, tasks);
            const blockerTask = task.dependsOnId ? tasks.find((t) => t.id === task.dependsOnId) : undefined;
            return (
              <TaskRow
                key={task.id}
                task={task}
                score={s?.score ?? 0}
                isAtRisk={s?.isAtRisk ?? false}
                isOverdue={s?.isOverdue ?? false}
                depth={0}
                tasks={tasks}
                scoredById={scoredById}
                onDone={markDone}
                onOpen={markOpen}
                onSetDep={handleSetDependency}
                onAddTask={addTask}
                isBlocked={blocked}
                blockedBy={blockerTask?.title}
              />
            );
          })}
        </ul>
      </section>

      {doneTasks.length > 0 && (
        <section className="mt-8">
          <h2 className="font-semibold text-lg mb-3 text-gray-400">
            Done ({doneTasks.length})
          </h2>
          <ul className="space-y-1">
            {doneTasks.map((task) => (
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
