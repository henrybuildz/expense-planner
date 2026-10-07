import { useEffect, useState } from 'react';

export const STORAGE_ERROR_EVENT = 'expense-planner:storage-error';
let storageFailed = false;
export const hasStorageFailed = () => storageFailed;

function reportFailure() {
  storageFailed = true;
  window.dispatchEvent(new Event(STORAGE_ERROR_EVENT));
}

// Keep the raw text of anything we are about to discard, so a bug or a hand-edit
// never destroys the user's only copy of their data without a trace.
function backupRaw(key, raw) {
  try {
    window.localStorage.setItem(`${key}:corrupt-backup`, raw);
  } catch {
    /* nothing more we can do */
  }
}

/**
 * Reads `key` from localStorage. Corrupt JSON, missing keys, blocked storage
 * (private mode) and failed `sanitize` checks all fall back to `fallback`.
 * Unusable or partially-dropped data is copied to `<key>:corrupt-backup` first.
 */
export function readStorage(key, fallback, sanitize) {
  let raw = null;
  try {
    raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    const clean = sanitize ? sanitize(parsed) : parsed;
    if (clean === undefined) {
      backupRaw(key, raw);
      return fallback;
    }
    if (Array.isArray(parsed) && Array.isArray(clean) && clean.length !== parsed.length) {
      backupRaw(key, raw); // some records were invalid and are being dropped
    }
    return clean;
  } catch {
    if (raw !== null) backupRaw(key, raw); // JSON.parse failed
    return fallback;
  }
}

/**
 * useState that persists to localStorage and stays in sync across tabs/windows.
 * `sanitize(parsed)` should return a cleaned value, or undefined to reject it.
 * `initialValue` and `sanitize` must be stable (module-level) references.
 */
export function useLocalStorage(key, initialValue, sanitize) {
  const [value, setValue] = useState(() => readStorage(key, initialValue, sanitize));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded or storage blocked: keep working in memory, but tell the
      // user (App shows a banner) instead of silently losing their changes.
      reportFailure();
    }
  }, [key, value]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== key) return;
      if (event.newValue === null) {
        setValue(initialValue);
        return;
      }
      try {
        const parsed = JSON.parse(event.newValue);
        const clean = sanitize ? sanitize(parsed) : parsed;
        if (clean !== undefined) setValue(clean);
      } catch {
        // Ignore malformed external writes.
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, initialValue, sanitize]);

  return [value, setValue];
}
