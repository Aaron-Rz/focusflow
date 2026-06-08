'use client';

import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';

type Phase = 'work' | 'break';

interface PomodoroState {
  phase: Phase;
  startedAt: number | null;
  accumulatedMs: number;
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

function formatCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function PomodoroTimer() {
  const { pomodoroWorkMin, pomodoroBreakMin, setPomodoroWorkMin, setPomodoroBreakMin } =
    useSettingsStore();

  const [state, setState] = useState<PomodoroState>({
    phase: 'work',
    startedAt: null,
    accumulatedMs: 0,
  });
  const [, setTick] = useState(0);
  const didRingRef = useRef(false);

  const phaseDurationMs =
    (state.phase === 'work' ? pomodoroWorkMin : pomodoroBreakMin) * 60_000;

  const elapsed =
    state.startedAt !== null
      ? state.accumulatedMs + (Date.now() - state.startedAt)
      : state.accumulatedMs;

  const remainingMs = Math.max(0, phaseDurationMs - elapsed);
  const running = state.startedAt !== null;
  const finished = remainingMs === 0;
  const progress = phaseDurationMs > 0 ? Math.min(1, elapsed / phaseDurationMs) : 0;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (finished && running && !didRingRef.current) {
      didRingRef.current = true;
      beep();
      setState((s) => ({ ...s, startedAt: null }));
    }
    if (!finished) didRingRef.current = false;
  }, [finished, running]);

  const handleStartPause = () => {
    if (finished) return;
    if (running) {
      setState((s) => ({
        ...s,
        startedAt: null,
        accumulatedMs: s.accumulatedMs + (Date.now() - s.startedAt!),
      }));
    } else {
      setState((s) => ({ ...s, startedAt: Date.now() }));
    }
  };

  const handleReset = () => {
    setState({ phase: state.phase, startedAt: null, accumulatedMs: 0 });
    didRingRef.current = false;
  };

  const handleSkip = () => {
    setState({
      phase: state.phase === 'work' ? 'break' : 'work',
      startedAt: null,
      accumulatedMs: 0,
    });
    didRingRef.current = false;
  };

  const isWork = state.phase === 'work';
  const phaseColor = isWork ? 'var(--accent)' : 'var(--ok)';

  return (
    <div
      style={{
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--r-md)',
        padding: '16px',
        background: 'var(--bg-1)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: 'var(--ff-dm-sans, sans-serif)',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--t2)',
            }}
          >
            Pomodoro
          </span>
          <span
            style={{
              fontSize: 11,
              padding: '1px 6px',
              borderRadius: 'var(--r)',
              border: '1px solid',
              borderColor: phaseColor,
              color: phaseColor,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {state.phase}
          </span>
          {finished && (
            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
              done
            </span>
          )}
        </div>
        {/* Duration controls */}
        <div className="flex items-center gap-3" style={{ color: 'var(--t2)', fontSize: 11 }}>
          <label className="flex items-center gap-1">
            W
            <input
              type="number"
              min={1}
              max={120}
              value={pomodoroWorkMin}
              onChange={(e) => { setPomodoroWorkMin(Number(e.target.value)); handleReset(); }}
              style={{ width: 36, padding: '2px 4px', textAlign: 'center' }}
            />
          </label>
          <label className="flex items-center gap-1">
            B
            <input
              type="number"
              min={1}
              max={60}
              value={pomodoroBreakMin}
              onChange={(e) => { setPomodoroBreakMin(Number(e.target.value)); handleReset(); }}
              style={{ width: 36, padding: '2px 4px', textAlign: 'center' }}
            />
          </label>
        </div>
      </div>

      {/* Countdown */}
      <div
        className="text-center tabular-nums my-4"
        style={{
          fontFamily: 'var(--ff-dm-sans, sans-serif)',
          fontSize: 48,
          fontWeight: 300,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          color: finished ? phaseColor : 'var(--t1)',
        }}
      >
        {formatCountdown(remainingMs)}
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 2,
          background: 'var(--bg-3)',
          borderRadius: 1,
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${(progress * 100).toFixed(1)}%`,
            background: phaseColor,
            transition: 'width 1s linear',
            borderRadius: 1,
          }}
        />
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={handleStartPause}
          disabled={finished}
          style={{
            flex: 1,
            padding: '7px 12px',
            borderRadius: 'var(--r)',
            border: '1px solid',
            borderColor: running ? 'var(--border-2)' : 'var(--accent)',
            background: running ? 'var(--bg-2)' : 'var(--accent)',
            color: running ? 'var(--t1)' : 'var(--accent-text)',
            cursor: finished ? 'default' : 'pointer',
            opacity: finished ? 0.4 : 1,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            minHeight: 36,
          }}
        >
          {running ? 'Pause' : finished ? 'Done' : 'Start'}
        </button>
        <button
          onClick={handleReset}
          style={{
            padding: '7px 12px',
            borderRadius: 'var(--r)',
            border: '1px solid var(--border-2)',
            background: 'transparent',
            color: 'var(--t2)',
            cursor: 'pointer',
            fontSize: 12,
            minHeight: 36,
          }}
        >
          Reset
        </button>
        <button
          onClick={handleSkip}
          title={`Switch to ${isWork ? 'break' : 'work'}`}
          style={{
            padding: '7px 12px',
            borderRadius: 'var(--r)',
            border: '1px solid var(--border-2)',
            background: 'transparent',
            color: 'var(--t2)',
            cursor: 'pointer',
            fontSize: 12,
            minHeight: 36,
          }}
        >
          Skip →
        </button>
      </div>
    </div>
  );
}
