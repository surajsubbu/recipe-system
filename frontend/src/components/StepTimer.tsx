"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { formatTimer } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  PlayIcon,
  PauseIcon,
  ArrowPathIcon,
  PencilIcon,
  PlusIcon,
  MinusIcon,
} from "@heroicons/react/24/solid";

interface StepTimerProps {
  seconds: number;
  className?: string;
  autoStart?: boolean;
}

type TimerState = "idle" | "running" | "paused" | "done";

export function StepTimer({
  seconds: initialSeconds,
  className,
  autoStart = false,
}: StepTimerProps) {
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds);
  const [remaining, setRemaining] = useState(initialSeconds);
  const [timerState, setTimerState] = useState<TimerState>(
    autoStart ? "running" : "idle"
  );
  const [editing, setEditing] = useState(false);
  const [editMinutes, setEditMinutes] = useState(
    Math.floor(initialSeconds / 60).toString()
  );
  const [editSecs, setEditSecs] = useState(
    (initialSeconds % 60).toString()
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(() => {
    setRemaining((prev) => {
      if (prev <= 1) {
        setTimerState("done");
        if (intervalRef.current) clearInterval(intervalRef.current);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Timer done! \u23F0", { body: "Step complete" });
        }
        return 0;
      }
      return prev - 1;
    });
  }, []);

  useEffect(() => {
    if (timerState === "running") {
      intervalRef.current = setInterval(tick, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerState, tick]);

  // Reset when seconds prop changes (new step)
  useEffect(() => {
    setTotalSeconds(initialSeconds);
    setRemaining(initialSeconds);
    setTimerState(autoStart ? "running" : "idle");
    setEditMinutes(Math.floor(initialSeconds / 60).toString());
    setEditSecs((initialSeconds % 60).toString());
  }, [initialSeconds, autoStart]);

  function start() {
    if (timerState === "done") {
      setRemaining(totalSeconds);
    }
    setTimerState("running");
  }

  function pause() {
    setTimerState("paused");
  }

  function reset() {
    setRemaining(totalSeconds);
    setTimerState("idle");
  }

  function addTime(delta: number) {
    setRemaining((prev) => Math.max(0, prev + delta));
    setTotalSeconds((prev) => Math.max(0, prev + delta));
  }

  function applyEdit() {
    const mins = parseInt(editMinutes) || 0;
    const secs = parseInt(editSecs) || 0;
    const newTotal = Math.max(0, mins * 60 + secs);
    setTotalSeconds(newTotal);
    setRemaining(newTotal);
    setTimerState("idle");
    setEditing(false);
  }

  function cancelEdit() {
    setEditMinutes(Math.floor(totalSeconds / 60).toString());
    setEditSecs((totalSeconds % 60).toString());
    setEditing(false);
  }

  const pct = totalSeconds > 0 ? ((totalSeconds - remaining) / totalSeconds) * 100 : 0;
  const isDone = timerState === "done";
  const isRunning = timerState === "running";

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3",
          className
        )}
      >
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            className="w-14 rounded-lg border border-border bg-muted px-2 py-1.5 text-center text-sm text-foreground focus:border-primary focus:outline-none"
            value={editMinutes}
            onChange={(e) => setEditMinutes(e.target.value)}
            aria-label="Minutes"
          />
          <span className="text-xs text-muted-foreground">m</span>
          <input
            type="number"
            min="0"
            max="59"
            className="w-14 rounded-lg border border-border bg-muted px-2 py-1.5 text-center text-sm text-foreground focus:border-primary focus:outline-none"
            value={editSecs}
            onChange={(e) => setEditSecs(e.target.value)}
            aria-label="Seconds"
          />
          <span className="text-xs text-muted-foreground">s</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={applyEdit}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            Set
          </button>
          <button
            onClick={cancelEdit}
            className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Normal mode ────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3",
        isDone
          ? "border-green-500/40 bg-green-500/10"
          : "border-primary/30 bg-primary/5",
        className
      )}
      role="timer"
      aria-label={`Timer: ${formatTimer(remaining)} remaining`}
    >
      {/* Circular progress */}
      <div className="relative h-10 w-10 flex-shrink-0">
        <svg
          className="h-10 w-10 -rotate-90"
          viewBox="0 0 36 36"
          aria-hidden="true"
        >
          <circle
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            stroke="currentColor"
            className="text-muted/30"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            stroke="currentColor"
            className={isDone ? "text-green-400" : "text-primary"}
            strokeWidth="3"
            strokeDasharray="100"
            strokeDashoffset={100 - pct}
            strokeLinecap="round"
          />
        </svg>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center text-[9px] font-bold",
            isDone ? "text-green-400" : "text-primary"
          )}
        >
          {isDone ? "\u2713" : formatTimer(remaining)}
        </span>
      </div>

      {/* Label */}
      <div className="flex-1">
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            isDone ? "text-green-400" : "text-foreground"
          )}
        >
          {isDone ? "Done!" : formatTimer(remaining)}
        </p>
        <p className="text-xs text-muted-foreground">
          of {formatTimer(totalSeconds)}
        </p>
      </div>

      {/* Controls */}
      <div className="flex gap-1">
        {/* Quick +/- 30s buttons (visible when running or paused) */}
        {(isRunning || timerState === "paused") && (
          <>
            <button
              onClick={() => addTime(-30)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
              aria-label="Subtract 30 seconds"
              title="-30s"
            >
              <MinusIcon className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => addTime(30)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
              aria-label="Add 30 seconds"
              title="+30s"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          </>
        )}

        {!isDone && (
          <button
            onClick={isRunning ? pause : start}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/20"
            aria-label={isRunning ? "Pause timer" : "Start timer"}
          >
            {isRunning ? (
              <PauseIcon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PlayIcon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}

        {/* Edit button (only when idle or done) */}
        {(timerState === "idle" || isDone) && (
          <button
            onClick={() => {
              setEditMinutes(Math.floor(totalSeconds / 60).toString());
              setEditSecs((totalSeconds % 60).toString());
              setEditing(true);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
            aria-label="Edit timer"
          >
            <PencilIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}

        <button
          onClick={reset}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
          aria-label="Reset timer"
        >
          <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
