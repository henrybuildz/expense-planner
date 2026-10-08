import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './AppContext';
import { supabase, syncEnabled } from '../lib/supabase';
import { hasPendingChanges, runSync } from '../sync/engine';
import { loadMeta } from '../sync/meta';
import { createRemote } from '../sync/remote';
import { TABLE_NAMES, TABLES } from '../sync/tables';

const SyncContext = createContext(null);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Resolves once `test()` is true (React applies queued state updates on its next render).
async function waitUntil(test, timeoutMs = 2000) {
  const start = Date.now();
  while (!test() && Date.now() - start < timeoutMs) await wait(20);
}

const errorText = (e) =>
  (e && (e.message || e.error_description)) ? String(e.message || e.error_description) : 'Something went wrong';

export function SyncProvider({ children }) {
  const app = useApp();
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!syncEnabled);
  const [status, setStatus] = useState('idle'); // idle | syncing | offline | error
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [error, setError] = useState('');

  // Always-fresh views of state for the async sync code (it must not capture stale values).
  const latest = useRef(app);
  latest.current = app;
  const userRef = useRef(null);
  userRef.current = user;
  const metaRef = useRef(null);
  if (!metaRef.current) metaRef.current = loadMeta();
  const running = useRef(false);
  const again = useRef(false);
  const timer = useRef(null);

  const getRecords = useCallback((name) => latest.current[name], []);
  const store = useMemo(
    () => ({
      get: (name) => latest.current[name],
      update: (name, fn) => latest.current.updateTable(name, fn),
    }),
    []
  );

  // ---------------------------------------------------------------- auth
  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session ? data.session.user : null);
      setAuthReady(true);
    });
    // Keep this callback synchronous: calling other Supabase methods inside it can deadlock.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session ? session.user : null);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // ---------------------------------------------------------------- syncing
  const syncNow = useCallback(async () => {
    const current = userRef.current;
    if (!supabase || !current) return false;
    if (running.current) {
      again.current = true; // run once more when the current sync finishes
      return true;
    }
    running.current = true;
    setStatus('syncing');
    let succeeded = false;
    try {
      const meta = metaRef.current;
      if (meta.userId !== current.id) {
        // This device last synced with a different account (or never). Never silently mix accounts.
        const hasLocal = TABLE_NAMES.some((n) => TABLES[n].toList(latest.current[n]).length > 0);
        if (meta.userId && hasLocal) {
          const addIt = window.confirm(
            'This device still holds data from a different account.\n\nOK = add that data to the account you just signed in with.\nCancel = remove it from this device and load this account’s data instead.'
          );
          if (!addIt) {
            meta.reset(current.id); // forget the old snapshot first so the wipe is not pushed as deletions
            latest.current.clearAll();
            await waitUntil(() => TABLE_NAMES.every((n) => TABLES[n].toList(latest.current[n]).length === 0));
          }
        }
        meta.reset(current.id);
      }
      await runSync({ remote: createRemote(supabase), userId: current.id, store, meta });
      setStatus('idle');
      setError('');
      setLastSyncedAt(Date.now());
      succeeded = true;
    } catch (e) {
      setStatus(navigator.onLine ? 'error' : 'offline');
      setError(errorText(e));
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        clearTimeout(timer.current);
        timer.current = setTimeout(syncNow, 300);
      }
    }
    return succeeded;
  }, [store]);

  // Coalesces bursts of triggers (typing, focus + visibility events, ...) into a single sync.
  const requestSync = useCallback(
    (delay = 800) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(syncNow, delay);
    },
    [syncNow]
  );

  const userId = user ? user.id : null;

  // Sign-in (or page load while signed in): sync straight away.
  useEffect(() => {
    if (userId) requestSync(0);
    return () => clearTimeout(timer.current);
  }, [userId, requestSync]);

  // Local edits: push shortly after the last change (only when there is something to push).
  useEffect(() => {
    if (!userId) return;
    if (hasPendingChanges(metaRef.current, getRecords)) requestSync(1500);
  }, [userId, app.transactions, app.budgets, app.subscriptions, getRecords, requestSync]);

  // Come back to the app, regain network, or just wait: pick up changes from other devices.
  useEffect(() => {
    if (!userId) return undefined;
    const check = () => {
      if (document.visibilityState === 'visible') requestSync(300);
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    const interval = setInterval(check, 60000);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      clearInterval(interval);
    };
  }, [userId, requestSync]);

  // ---------------------------------------------------------------- actions
  const signIn = useCallback(async () => {
    setError('');
    // Back to exactly this page (no hash/query), which must be in Supabase's Redirect URLs list.
    const redirectTo = window.location.origin + window.location.pathname;
    const { error: e } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (e) setError(errorText(e));
  }, []);

  const signOut = useCallback(async () => {
    clearTimeout(timer.current);
    await supabase.auth.signOut();
    setStatus('idle');
    setError('');
  }, []);

  // Sign out AND remove this account's data from this device (for shared / borrowed computers).
  const signOutAndWipe = useCallback(async () => {
    clearTimeout(timer.current);
    await waitUntil(() => !running.current, 10000);
    const synced = await syncNow(); // make sure nothing is lost before it is removed here
    await waitUntil(() => !running.current, 10000);
    if (!synced && hasPendingChanges(metaRef.current, getRecords)) {
      const go = window.confirm('Some recent changes could not be uploaded and will be lost if you continue. Remove the data from this device anyway?');
      if (!go) return;
    }
    await supabase.auth.signOut(); // sign out first, so clearing below is never pushed as deletions
    userRef.current = null;
    metaRef.current.reset(null);
    latest.current.clearAll();
    setStatus('idle');
    setError('');
  }, [syncNow, getRecords]);

  const value = useMemo(
    () => ({
      enabled: syncEnabled,
      authReady,
      user,
      signedIn: Boolean(user),
      status,
      lastSyncedAt,
      error,
      signIn,
      signOut,
      signOutAndWipe,
      syncNow,
    }),
    [authReady, user, status, lastSyncedAt, error, signIn, signOut, signOutAndWipe, syncNow]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>');
  return ctx;
}
