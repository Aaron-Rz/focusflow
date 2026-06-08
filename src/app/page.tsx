'use client';

import { useEffect, useState } from 'react';
import { useTaskStore, getTaskDepth } from '@/stores/taskStore';
import { useFilterStore } from '@/stores/filterStore';
import { rankTasks } from '@/lib/algorithm/score';
import { effectiveEffortMin } from '@/lib/algorithm/dependencies';
import { getDistinctCategories } from '@/lib/utils/categories';
import type { Importance, CogLoad, Task } from '@/types';
import { TaskTimer } from '@/components/TaskTimer';
import { PomodoroTimer } from '@/components/PomodoroTimer';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';

/* ─── Helpers ─── */

const IMP_LABELS: Record<number, string> = { 1: '1', 2: '2', 3: '3', 4: '4' };
const CL_LABELS: Record<number, string>  = { 1: '1', 2: '2', 3: '3' };

function scoreBadgeColor(score: number) {
  if (score >= 0.65) return 'var(--accent)';
  if (score >= 0.35) return 'var(--t2)';
  return 'var(--t3)';
}

function fmtDeadline(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ─── Label ─── */
function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontWeight: 600,
        padding: '1px 5px',
        borderRadius: 'var(--r)',
        border: '1px solid',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/* ─── AddTaskForm ─── */

interface AddTaskFormProps {
  parentId?: string;
  tasks: Task[];
  onAdd: (input: {
    title: string; effortMin: number; importance: Importance; cogLoad: CogLoad;
    deadline?: string; category?: string; dependsOnId?: string; parentId?: string;
  }) => Promise<string | null>;
  onCancel?: () => void;
  compact?: boolean;
}

function AddTaskForm({ parentId, tasks, onAdd, onCancel, compact = false }: AddTaskFormProps) {
  const [title, setTitle]         = useState('');
  const [effortMin, setEffortMin] = useState(30);
  const [importance, setImportance] = useState<Importance>(2);
  const [cogLoad, setCogLoad]     = useState<CogLoad>(2);
  const [deadline, setDeadline]   = useState('');
  const [category, setCategory]   = useState('');
  const [dependsOnId, setDependsOnId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');

  const siblingOptions = parentId
    ? tasks.filter((t) => t.parentId === parentId)
    : tasks.filter((t) => !t.parentId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setError('');
    setSubmitting(true);
    const err = await onAdd({
      title: title.trim(), effortMin, importance, cogLoad,
      deadline: deadline || undefined,
      category: category.trim() || undefined,
      dependsOnId: dependsOnId || undefined,
      parentId,
    });
    setSubmitting(false);
    if (err) { setError(err); return; }
    setTitle(''); setEffortMin(30); setImportance(2); setCogLoad(2);
    setDeadline(''); setCategory(''); setDependsOnId('');
    if (onCancel) onCancel();
  };

  const fieldLabel: React.CSSProperties = {
    display: 'block', fontSize: 10, letterSpacing: '0.05em',
    textTransform: 'uppercase', color: 'var(--t2)', marginBottom: 4,
  };

  if (compact) {
    return (
      <form
        onSubmit={handleSubmit}
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid var(--border)',
        }}
      >
        {error && (
          <p style={{ fontSize: 11, color: 'var(--error)', marginBottom: 6 }}>{error}</p>
        )}
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Subtask title…"
            required
            autoFocus
            style={{ flex: 1, minWidth: 0 }}
          />
          <select
            value={effortMin}
            onChange={(e) => setEffortMin(Number(e.target.value))}
            style={{ width: 64 }}
          >
            {[5,10,15,20,30,45,60,90,120].map(v => <option key={v} value={v}>{v}m</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            style={{
              padding: '5px 12px',
              borderRadius: 'var(--r)',
              background: 'var(--accent)',
              color: 'var(--accent-text)',
              border: 'none',
              cursor: submitting || !title.trim() ? 'default' : 'pointer',
              opacity: submitting || !title.trim() ? 0.5 : 1,
              fontSize: 12,
              fontWeight: 600,
              minHeight: 30,
            }}
          >
            {submitting ? 'Adding…' : 'Add'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '5px 10px',
                borderRadius: 'var(--r)',
                background: 'transparent',
                border: '1px solid var(--border-2)',
                color: 'var(--t2)',
                cursor: 'pointer',
                fontSize: 12,
                minHeight: 30,
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && (
        <div style={{
          fontSize: 12, color: 'var(--error)',
          background: 'rgba(192,48,48,0.08)',
          border: '1px solid var(--error)',
          borderRadius: 'var(--r)',
          padding: '6px 10px',
        }}>
          {error}
        </div>
      )}
      {/* Title */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        required
        autoFocus
      />
      {/* Row: effort · importance · cogLoad */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 80px' }}>
          <label style={fieldLabel}>Effort (min)</label>
          <input
            type="number"
            min={1}
            value={effortMin}
            onChange={(e) => setEffortMin(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ flex: '1 1 100px' }}>
          <label style={fieldLabel}>Importance</label>
          <select value={importance} onChange={(e) => setImportance(Number(e.target.value) as Importance)} style={{ width: '100%' }}>
            {([1,2,3,4] as Importance[]).map((v) => (
              <option key={v} value={v}>{IMP_LABELS[v]} — {['','Low','Med','High','Crit'][v]}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '1 1 100px' }}>
          <label style={fieldLabel}>Cog Load</label>
          <select value={cogLoad} onChange={(e) => setCogLoad(Number(e.target.value) as CogLoad)} style={{ width: '100%' }}>
            {([1,2,3] as CogLoad[]).map((v) => (
              <option key={v} value={v}>{CL_LABELS[v]} — {['','Light','Mod','Heavy'][v]}</option>
            ))}
          </select>
        </div>
      </div>
      {/* Row: deadline · category */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 160px' }}>
          <label style={fieldLabel}>Deadline</label>
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <label style={fieldLabel}>Category</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. work" style={{ width: '100%' }} />
        </div>
      </div>
      {/* Must-Do dependency */}
      {siblingOptions.length > 0 && (
        <div>
          <label style={fieldLabel}>Must-Do after</label>
          <select value={dependsOnId} onChange={(e) => setDependsOnId(e.target.value)} style={{ width: '100%' }}>
            <option value="">— none —</option>
            {siblingOptions.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
      )}
      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          style={{
            flex: 1,
            padding: '8px 16px',
            borderRadius: 'var(--r)',
            background: 'var(--accent)',
            color: 'var(--accent-text)',
            border: 'none',
            cursor: submitting || !title.trim() ? 'default' : 'pointer',
            opacity: submitting || !title.trim() ? 0.5 : 1,
            fontSize: 13,
            fontWeight: 600,
            minHeight: 44,
            letterSpacing: '0.03em',
          }}
        >
          {submitting ? 'Adding…' : 'Add Task'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--r)',
              background: 'transparent',
              border: '1px solid var(--border-2)',
              color: 'var(--t2)',
              cursor: 'pointer',
              fontSize: 13,
              minHeight: 44,
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/* ─── TaskRow ─── */

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

  const handleSetDep = async (val: string) => {
    setDepError('');
    const err = await onSetDep(task.id, val);
    if (typeof err === 'string') setDepError(err);
  };

  const siblingDepOptions = tasks.filter(
    (t) => t.id !== task.id && t.parentId === task.parentId
  );

  const effortDisplay = effectiveEffortMin(task, tasks);

  // Card visual state
  const borderColor = isOverdue
    ? 'var(--error)'
    : isAtRisk
    ? 'var(--warn)'
    : isBlocked
    ? 'var(--border-2)'
    : 'var(--border)';

  const cardBg = isOverdue
    ? 'rgba(192,48,48,0.04)'
    : isAtRisk
    ? 'rgba(212,98,40,0.04)'
    : 'var(--bg-1)';

  return (
    <li style={{ listStyle: 'none' }}>
      <div
        style={{
          background: cardBg,
          border: '1px solid var(--border)',
          borderLeft: `3px solid ${borderColor}`,
          borderRadius: 'var(--r-md)',
          padding: depth > 0 ? '8px 10px' : '10px 12px',
          opacity: isBlocked ? 0.5 : 1,
          marginLeft: depth > 0 ? 16 : 0,
        }}
      >
        {/* Row 1: checkbox + title + score badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <input
            type="checkbox"
            checked={false}
            onChange={() => onDone(task.id)}
            disabled={isBlocked}
            style={{ marginTop: 2 }}
          />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: depth > 0 ? 13 : 14,
              fontWeight: 500,
              color: 'var(--t1)',
              lineHeight: 1.4,
              wordBreak: 'break-word',
            }}
          >
            {task.title}
          </span>
          <span
            className="tabular-nums"
            style={{
              fontSize: 11,
              color: scoreBadgeColor(score),
              background: 'var(--bg-2)',
              border: '1px solid var(--border-2)',
              borderRadius: 'var(--r)',
              padding: '1px 5px',
              flexShrink: 0,
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            {score.toFixed(2)}
          </span>
        </div>

        {/* Row 2: metadata + status badges */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '4px 8px',
            marginTop: 5,
            marginLeft: 24,
            fontSize: 11,
            color: 'var(--t2)',
          }}
        >
          <span>{effortDisplay}m</span>
          <span style={{ color: 'var(--border-2)' }}>·</span>
          <span>★{task.importance}</span>
          <span style={{ color: 'var(--border-2)' }}>·</span>
          <span>⚡{task.cogLoad}</span>
          {task.category && (
            <>
              <span style={{ color: 'var(--border-2)' }}>·</span>
              <span style={{ color: 'var(--accent)' }}>#{task.category}</span>
            </>
          )}
          {task.deadline && (
            <>
              <span style={{ color: 'var(--border-2)' }}>·</span>
              <span>→ {fmtDeadline(task.deadline)}</span>
            </>
          )}
          {isBlocked && blockedBy && (
            <>
              <span style={{ color: 'var(--border-2)' }}>·</span>
              <span style={{ color: 'var(--t3)' }}>after: {blockedBy}</span>
            </>
          )}
          {isBlocked && (
            <Label style={{ borderColor: 'var(--border-2)', color: 'var(--t3)' }}>blocked</Label>
          )}
          {isOverdue && !isBlocked && (
            <Label style={{ borderColor: 'var(--error)', color: 'var(--error)' }}>overdue</Label>
          )}
          {isAtRisk && !isOverdue && !isBlocked && (
            <Label style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}>at risk</Label>
          )}
        </div>

        {/* Row 3: timer */}
        <div style={{ marginLeft: 24 }}>
          <TaskTimer taskId={task.id} isDone={task.status === 'done'} />
        </div>

        {/* Dependency selector */}
        {siblingDepOptions.length > 0 && (
          <div style={{ marginTop: 6, marginLeft: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>after:</span>
            <select
              value={task.dependsOnId ?? ''}
              onChange={(e) => handleSetDep(e.target.value)}
              style={{ fontSize: 11, padding: '2px 4px', width: 'auto' }}
            >
              <option value="">— none —</option>
              {siblingDepOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.title}</option>
              ))}
            </select>
            {depError && <span style={{ fontSize: 11, color: 'var(--error)' }}>{depError}</span>}
          </div>
        )}

        {/* Subtask form toggle */}
        {canAddSubtask && !showSubtaskForm && (
          <button
            onClick={() => setShowSubtaskForm(true)}
            style={{
              marginTop: 6,
              marginLeft: 24,
              fontSize: 11,
              color: 'var(--t3)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            + subtask
          </button>
        )}
        {showSubtaskForm && (
          <div style={{ marginLeft: 24 }}>
            <AddTaskForm
              parentId={task.id}
              tasks={tasks}
              onAdd={onAddTask}
              onCancel={() => setShowSubtaskForm(false)}
              compact
            />
          </div>
        )}
      </div>

      {/* Child tasks */}
      {children.length > 0 && (
        <ul style={{ margin: '4px 0 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
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

/* ─── Home ─── */

export default function Home() {
  const { tasks, loading, loadTasks, addTask, markDone, markOpen, setDependency } = useTaskStore();
  const { activeCategories, toggleCategory, clearFilter } = useFilterStore();
  const [depError, setDepError]         = useState('');
  const [showAddForm, setShowAddForm]   = useState(false);
  const [showPomodoro, setShowPomodoro] = useState(false);
  const [showDone, setShowDone]         = useState(false);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const now = new Date();

  const openTasks = tasks.filter((t) => t.status !== 'done');
  const scorable  = openTasks.map((t) => ({ ...t, effortMin: effectiveEffortMin(t, tasks) }));
  const ranked    = rankTasks(scorable, now);
  const scoredById = new Map(
    ranked.map(({ task, score, isAtRisk, isOverdue }) => [task.id, { score, isAtRisk, isOverdue }])
  );

  const displayScore = (taskId: string): number => {
    const own = scoredById.get(taskId)?.score ?? 0;
    const children = tasks.filter((t) => t.parentId === taskId && t.status !== 'done');
    if (children.length === 0) return own;
    return Math.max(own, ...children.flatMap((c) => {
      const cScore = scoredById.get(c.id)?.score ?? 0;
      const gc = tasks.filter((t) => t.parentId === c.id && t.status !== 'done');
      return [cScore, ...gc.map((g) => scoredById.get(g.id)?.score ?? 0)];
    }));
  };

  function taskMatchesFilter(task: Task): boolean {
    if (activeCategories.length === 0) return true;
    if (task.category && activeCategories.includes(task.category)) return true;
    return tasks.some(
      (t) => t.status !== 'done' && t.parentId === task.id &&
             t.category != null && activeCategories.includes(t.category)
    );
  }

  const allCategories = getDistinctCategories(tasks);

  const topLevelOpen = openTasks
    .filter((t) => !t.parentId && taskMatchesFilter(t))
    .sort((a, b) => displayScore(b.id) - displayScore(a.id));

  const doneTasks = tasks.filter((t) => t.status === 'done' && !t.parentId);

  const handleSetDependency = async (taskId: string, value: string): Promise<void> => {
    setDepError('');
    const err = await setDependency(taskId, value || undefined);
    if (err) setDepError(err);
  };

  const sectionLabel: React.CSSProperties = {
    fontFamily: 'var(--ff-dm-sans, sans-serif)',
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--t2)',
  };

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh' }}>

      {/* ── Sticky page header ── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: 'var(--bg-1)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            maxWidth: 640,
            margin: '0 auto',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'var(--ff-dm-sans, sans-serif)',
                fontWeight: 800,
                fontSize: 18,
                letterSpacing: '-0.02em',
                color: 'var(--t1)',
                lineHeight: 1,
              }}
            >
              Tasks
            </h1>
            <p style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>
              {loading ? 'loading…' : `${topLevelOpen.length} open${activeCategories.length > 0 ? ' · filtered' : ''}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ThemeToggleButton />
            <button
              onClick={() => setShowAddForm((v) => !v)}
              style={{
                padding: '8px 14px',
                borderRadius: 'var(--r)',
                background: showAddForm ? 'var(--bg-3)' : 'var(--accent)',
                color: showAddForm ? 'var(--t1)' : 'var(--accent-text)',
                border: showAddForm ? '1px solid var(--border-2)' : 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                minHeight: 36,
                minWidth: 44,
                letterSpacing: '0.02em',
              }}
            >
              {showAddForm ? '× close' : '+ add'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Add task form (collapsible) ── */}
      {showAddForm && (
        <div
          style={{
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-1)',
          }}
        >
          <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px' }}>
            <AddTaskForm
              tasks={tasks}
              onAdd={addTask}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        </div>
      )}

      {/* ── Dep error ── */}
      {depError && (
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '8px 16px 0' }}>
          <div
            style={{
              fontSize: 12,
              color: 'var(--error)',
              background: 'rgba(192,48,48,0.08)',
              border: '1px solid var(--error)',
              borderRadius: 'var(--r)',
              padding: '6px 10px',
            }}
          >
            {depError}
          </div>
        </div>
      )}

      {/* ── Category filter bar ── */}
      {allCategories.length > 0 && (
        <div
          style={{
            borderBottom: '1px solid var(--border)',
            padding: '8px 16px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '6px 8px',
          }}
        >
          <span style={{ ...sectionLabel, fontSize: 10 }}>filter</span>
          {allCategories.map((cat) => {
            const active = activeCategories.includes(cat);
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
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
          {activeCategories.length > 0 && (
            <button
              onClick={clearFilter}
              style={{
                fontSize: 11, color: 'var(--t3)', background: 'none',
                border: 'none', cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              clear
            </button>
          )}
        </div>
      )}

      {/* ── Main content ── */}
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '12px 16px 24px' }}>

        {/* Open task list */}
        {loading && (
          <p style={{ color: 'var(--t3)', fontSize: 13, padding: '24px 0' }}>Loading…</p>
        )}
        {!loading && topLevelOpen.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 0',
              color: 'var(--t3)',
              fontSize: 13,
            }}
          >
            <p>No tasks. Tap <strong style={{ color: 'var(--t2)' }}>+ add</strong> to start.</p>
          </div>
        )}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
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

        {/* ── Pomodoro timer (collapsible) ── */}
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setShowPomodoro((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 0',
              color: 'var(--t2)',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <span style={{ ...sectionLabel }}>Pomodoro</span>
            <span style={{ fontSize: 10, color: 'var(--t3)' }}>{showPomodoro ? '▲' : '▼'}</span>
          </button>
          {showPomodoro && (
            <div style={{ marginTop: 8 }}>
              <PomodoroTimer />
            </div>
          )}
        </div>

        {/* ── Done tasks (collapsible) ── */}
        {doneTasks.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <button
              onClick={() => setShowDone((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 0',
                color: 'var(--t2)',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <span style={{ ...sectionLabel }}>Done ({doneTasks.length})</span>
              <span style={{ fontSize: 10, color: 'var(--t3)' }}>{showDone ? '▲' : '▼'}</span>
            </button>
            {showDone && (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '8px 0 0 0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                {doneTasks.map((task) => (
                  <li
                    key={task.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}
                  >
                    <input
                      type="checkbox"
                      checked
                      onChange={() => markOpen(task.id)}
                    />
                    <span className="task-done-text" style={{ fontSize: 13 }}>
                      {task.title}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
