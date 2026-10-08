import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

export const UNDO_MS = 6000; // how long a delete can be undone

function Toast({ toast, onUndo, onDismiss }) {
  // Hovering or focusing the bar pauses the countdown, so it never vanishes while you are reaching for it.
  const [paused, setPaused] = useState(false);
  const duration = toast.duration || UNDO_MS;
  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const close = useRef(onDismiss);
  close.current = onDismiss;

  useEffect(() => {
    if (paused) return undefined;
    startedAt.current = Date.now();
    const timer = setTimeout(() => close.current(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current; // time left when paused
    };
  }, [paused, toast.id]);

  return (
    <div
      className="toast-in group relative w-[min(92vw,26rem)] overflow-hidden rounded-xl bg-slate-900 text-white shadow-lg ring-1 ring-black/10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${toast.onUndo ? 'truncate' : ''}`}>{toast.message}</p>
          {toast.detail && <p className={`text-xs text-slate-300 ${toast.onUndo ? 'truncate' : ''}`}>{toast.detail}</p>}
          {toast.onUndo && <span className="sr-only">Press Control or Command Z to undo.</span>}
        </div>
        {toast.onUndo && (
          <button
            type="button"
            onClick={() => onUndo(toast.id)}
            className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-emerald-300 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            Undo
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      {/* the time left to undo, shrinking; pauses together with the timer */}
      <div
        className="toast-bar h-0.5 origin-left bg-emerald-400"
        style={{ animationDuration: `${duration}ms`, animationPlayState: paused ? 'paused' : 'running' }}
      />
    </div>
  );
}

export default function UndoBar({ toasts, onUndo, onDismiss }) {
  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4 pb-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} onUndo={onUndo} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
