import { useEffect, useState } from 'react';

// Like useState, but remembered in sessionStorage: it survives a refresh of the same window, and is
// forgotten when the tab or installed app is closed. Used for "where was I" state that should NOT carry
// over to the next launch. Blocked storage (private mode) just means nothing is remembered.
export function useSessionState(key, initialValue, sanitize) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw === null) return initialValue;
      const clean = sanitize ? sanitize(JSON.parse(raw)) : JSON.parse(raw);
      return clean === undefined ? initialValue : clean;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* not remembered, which is harmless */
    }
  }, [key, value]);

  return [value, setValue];
}
