'use client';

import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';

type Phase = 'work' | 'break';

interface PomodoroState {
  phase: Phase;
  /** Wall-clock timestamp when the current phase started (ms). null = stopped. */
  startedAt: number | null;
  /** How many ms were already elapsed before the current start (accumulated from pauses). */
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
  } catch {
    // AudioContext may be unavailable in some environments — ignore silently
  }
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

  const elapsedMs =
    state.startedAt !== null
      ? state.accumulatedMs + (Date.now() - state.startedAt)
      : state.accumulatedMs;

  const remainingMs = Math.max(0, phaseDurationMs - elapsedMs);
  const running = state.startedAt !== null;
  const finished = remainingMs === 0;

  // Tick every second while running
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Ring when phase ends (only once per phase completion)
  useEffect(() => {
    if (finished && running && !didRingRef.current) {
      didRingRef.current = true;
      beep();
      // Auto-pause at phase end
      setState((s) => ({ ...s, startedAt: null }));
    }
    if (!finished) {
      didRingRef.current = false;
    }
  }, [finished, running]);

  const handleStartPause = () => {
    if (finished) return;
    if (running) {
      // Pause: accumulate elapsed so far
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

  const progress = phaseDurationMs > 0 ? elapsedMs / phaseDurationMs : 0;

  return (
    <div className="border border-gray-200 rounded p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">Pomodoro</h2>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <label>
            Work
            <input
              type="number"
              min={1}
              max={120}
              value={pomodoroWorkMin}
              onChange={(e) => {
                setPomodoroWorkMin(Number(e.target.value));
                handleReset();
              }}
              className="ml-1 w-10 border border-gray-300 rounded px-1 py-0.5 text-xs"
            />
            m
          </label>
          <label>
            Break
            <input
              type="number"
              min={1}
              max={60}
              value={pomodoroBreakMin}
              onChange={(e) => {
                setPomodoroBreakMin(Number(e.target.value));
                handleReset();
              }}
              className="ml-1 w-10 border border-gray-300 rounded px-1 py-0.5 text-xs"
            />
            m
          </label>
        </div>
      </div>

      {/* Phase indicator */}
      <div className="flex items-center gap-2">
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            state.phase === 'work'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-green-100 text-green-700'
          }`}
        >
          {state.phase === 'work' ? 'Work' : 'Break'}
        </span>
        {finished && (
          <span className="text-xs text-amber-600 font-medium">Phase complete!</span>
        )}
      </div>

      {/* Countdown */}
      <div className="text-4xl font-mono tabular-nums text-center py-2">
        {formatCountdown(remainingMs)}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            state.phase === 'work' ? 'bg-blue-400' : 'bg-green-400'
          }`}
          style={{ width: `${Math.min(100, progress * 100).toFixed(1)}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={handleStartPause}
          disabled={finished}
          className="flex-1 text-sm bg-blue-600 text-white rounded px-3 py-1 disabled:opacity-40 hover:bg-blue-700"
        >
          {running ? 'Pause' : finished ? 'Done' : 'Start'}
        </button>
        <button
          onClick={handleReset}
          className="text-sm border border-gray-300 rounded px-3 py-1 hover:bg-gray-50"
        >
          Reset
        </button>
        <button
          onClick={handleSkip}
          className="text-sm border border-gray-300 rounded px-3 py-1 hover:bg-gray-50"
          title={`Switch to ${state.phase === 'work' ? 'break' : 'work'}`}
        >
          Skip →
        </button>
      </div>
    </div>
  );
}
