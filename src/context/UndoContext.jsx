import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import UndoBar from '../components/ui/UndoBar';

const UndoContext = createContext(null);

const MAX_VISIBLE = 5; // a burst of deletes stacks; beyond this the oldest bar just closes (its delete stays)

let nextId = 1;

const isTyping = (target) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function UndoProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const latest = useRef(toasts);
  latest.current = toasts;

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  // Close every bar without undoing anything (used when the device's data is deliberately wiped).
  const dismissAll = useCallback(() => setToasts([]), []);

  // notify({ message, detail?, duration?, onUndo }): the delete has ALREADY happened; onUndo puts it back.
  const notify = useCallback((toast) => {
    const id = nextId++;
    setToasts((list) => [...list, { ...toast, id }].slice(-MAX_VISIBLE));
    return id;
  }, []);

  const undo = useCallback(
    (id) => {
      const toast = latest.current.find((t) => t.id === id);
      if (!toast) return; // already undone or expired
      dismiss(id);
      toast.onUndo();
    },
    [dismiss]
  );

  // Cmd/Ctrl+Z undoes the most recent delete, but never steals undo from a text field.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
      if (isTyping(e.target)) return;
      const newest = latest.current[latest.current.length - 1];
      if (!newest) return;
      e.preventDefault();
      undo(newest.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  const value = useMemo(() => ({ notify, dismissAll }), [notify, dismissAll]);

  return (
    <UndoContext.Provider value={value}>
      {children}
      <UndoBar toasts={toasts} onUndo={undo} onDismiss={dismiss} />
    </UndoContext.Provider>
  );
}

export function useUndo() {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error('useUndo must be used inside <UndoProvider>');
  return ctx;
}
