// Last-resort data rescue, used by the crash screen. It must keep working when the app itself is broken,
// so it deliberately depends on NOTHING from React context: it reads localStorage directly.
import { KEYS } from '../constants/storage';
import { readStorage } from '../hooks/useLocalStorage';
import { buildBackup } from './backup';
import { todayISO } from './dates';
import { sanitizeBudgets, sanitizeSubscriptions, sanitizeTransactions } from './sanitize';

const PREFIX = 'expense-planner:';

// Same format as Settings > Export, so it can be imported again later. Unreadable records are skipped (and
// readStorage keeps the raw text in a ':corrupt-backup' key first, so nothing is destroyed).
export function buildRescueBackup() {
  return buildBackup({
    transactions: readStorage(KEYS.transactions, [], sanitizeTransactions),
    budgets: readStorage(KEYS.budgets, {}, sanitizeBudgets),
    subscriptions: readStorage(KEYS.subscriptions, [], sanitizeSubscriptions),
  });
}

// Everything Pocket Book stored, byte for byte (even corrupt values). For people who need the raw data.
// The login session (a different key prefix) is never included.
export function buildRawDump() {
  const keys = {};
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PREFIX)) keys[key] = window.localStorage.getItem(key);
    }
  } catch {
    /* storage unavailable: an empty dump is all we can offer */
  }
  return {
    app: 'expense-planner-raw-dump',
    exportedAt: new Date().toISOString(),
    note: 'Raw browser storage for Pocket Book. Not importable; send it to whoever is helping you recover data.',
    keys,
  };
}

// Way out of a crash loop (the app crashes on every launch because of what is stored). In this order:
//   1. download a normal backup file,  2. keep a raw copy in the browser,  3. clear the app's data keys.
// Sync bookkeeping is cleared too, so a signed-in user's account data is merged back on the next sync
// instead of looking like "everything was deleted". Backups and the login session are left alone.
export function resetLocalData() {
  const dump = buildRawDump();
  downloadJson(`pocket-book-rescue-${todayISO()}.json`, buildRescueBackup());
  try {
    window.localStorage.setItem(KEYS.crashBackup, JSON.stringify(dump));
  } catch {
    /* storage full: the downloaded file is still the safety net */
  }
  [KEYS.transactions, KEYS.budgets, KEYS.subscriptions, KEYS.tab, KEYS.sync].forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* nothing more we can do */
    }
  });
}

export function downloadJson(filename, object) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(object, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
