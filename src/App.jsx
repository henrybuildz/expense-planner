import { useEffect, useRef, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { SyncProvider } from './context/SyncContext';
import { UndoProvider } from './context/UndoContext';
import { TABS, isTabId } from './constants/tabs';
import { KEYS } from './constants/storage';
import { STORAGE_ERROR_EVENT, hasStorageFailed } from './hooks/useLocalStorage';
import { useRequestPersistence } from './hooks/useRequestPersistence';
import { useSessionState } from './hooks/useSessionState';
import { sanitizeTab } from './utils/sanitize';
import { RETURN_TO_SETTINGS_KEY, useSync } from './context/SyncContext';
import Icon from './components/ui/Icon';
import Dashboard from './components/dashboard/Dashboard';
import Transactions from './components/transactions/Transactions';
import Budgets from './components/budgets/Budgets';
import Subscriptions from './components/subscriptions/Subscriptions';
import Calculator from './components/calculator/Calculator';
import Settings from './components/settings/Settings';
import ErrorBoundary from './components/system/ErrorBoundary';

// Full-width page gutters: the app fills the whole window instead of sitting in a centred column.
const GUTTER = 'w-full px-4 sm:px-6 lg:px-8';

const DOT = { idle: 'bg-emerald-500', syncing: 'animate-pulse bg-slate-400', offline: 'bg-amber-500', attention: 'bg-amber-500', error: 'bg-rose-500' };
const DOT_LABEL = {
  idle: 'Synced',
  syncing: 'Syncing',
  offline: 'Offline: changes will sync later',
  attention: 'Sync paused: open settings',
  error: 'Sync problem: open settings',
};

function Shell() {
  const { hasData } = useApp();
  useRequestPersistence(hasData); // ask the browser to keep the data once there is something worth keeping
  // Remembered for this window only: a refresh keeps the tab, closing and reopening the app starts at the dashboard.
  const [tab, setTab] = useSessionState(KEYS.tab, 'dashboard', sanitizeTab);
  // Earlier versions kept the tab in localStorage forever; drop that leftover so nothing stale lingers.
  useEffect(() => {
    try {
      window.localStorage.removeItem(KEYS.tab);
    } catch {
      /* blocked storage: nothing to clean */
    }
  }, []);
  // Settings is a separate view (opened from the title), not one of the five tabs, and is not remembered.
  // After the Google round trip the page reloads; reopen Settings so the user can SEE they are signed in.
  const [showSettings, setShowSettings] = useState(() => {
    try {
      return window.sessionStorage.getItem(RETURN_TO_SETTINGS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const { signedIn, status } = useSync();
  // On a phone the tab strip scrolls sideways; make sure the active tab is never out of sight (e.g. after a refresh).
  useEffect(() => {
    const el = document.getElementById(`tab-${tab}`);
    if (el && el.scrollIntoView) el.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [tab]);

  // The browser tab / history entry names the current screen instead of always saying "Pocket Book".
  useEffect(() => {
    const name = showSettings ? 'Settings' : TABS.find((t) => t.id === tab)?.label;
    document.title = name ? `${name} · Pocket Book` : 'Pocket Book';
  }, [tab, showSettings]);
  const [storageBroken, setStorageBroken] = useState(hasStorageFailed);

  useEffect(() => {
    const onFail = () => setStorageBroken(true);
    window.addEventListener(STORAGE_ERROR_EVENT, onFail);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, onFail);
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.removeItem(RETURN_TO_SETTINGS_KEY); // read once; cleared here so a StrictMode double-render cannot lose it
    } catch {
      /* private mode: nothing to clear */
    }
  }, []);

  // Escape closes the settings view.
  useEffect(() => {
    if (!showSettings) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeSettings();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSettings]);

  // ---- history: every screen change is a history entry, so the phone's Back gesture / the browser's Back
  // button steps back through tabs and out of Settings instead of leaving the app. `i` counts our own entries.
  const current = useRef({ tab, settings: showSettings });
  current.current = { tab, settings: showSettings };

  const record = (view, replace) => {
    try {
      const i = (window.history.state && window.history.state.pb && window.history.state.pb.i) || 0;
      const state = { pb: { ...view, i: replace ? i : i + 1 } };
      if (replace) window.history.replaceState(state, '');
      else window.history.pushState(state, '');
    } catch {
      /* history unavailable (sandboxed frame): navigation still works, Back just leaves */
    }
  };

  // Stamp the entry we arrived on, so Back can return to it.
  useEffect(() => {
    record(current.current, true);
  }, []);

  useEffect(() => {
    const onPop = (e) => {
      const view = e.state && e.state.pb;
      if (!view) return; // an entry that is not ours (another page, a hash): leave it alone
      const next = { tab: isTabId(view.tab) ? view.tab : 'dashboard', settings: Boolean(view.settings) };
      current.current = next; // before the re-render, so a click straight after Back compares against the truth
      setTab(next.tab);
      setShowSettings(next.settings);
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setTab]);

  const go = (view, { replace = false } = {}) => {
    const now = current.current;
    if (view.tab === now.tab && view.settings === now.settings) return;
    current.current = view; // two quick clicks before a re-render must not push the same entry twice
    setTab(view.tab);
    setShowSettings(view.settings);
    record(view, replace);
  };

  const goToTab = (id, options) => go({ tab: id, settings: false }, options);

  const closeSettings = () => {
    const state = window.history.state && window.history.state.pb;
    if (state && state.settings && state.i > 0) window.history.back(); // we pushed it, so step back out of it
    else go({ tab: current.current.tab, settings: false }, { replace: true });
  };

  const openSettings = () => {
    if (current.current.settings) closeSettings();
    else go({ tab: current.current.tab, settings: true });
    window.scrollTo(0, 0);
  };

  // WAI-ARIA tabs pattern: arrow keys / Home / End move between tabs.
  const onTabKeyDown = (e, index) => {
    let next;
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    goToTab(TABS[next].id, { replace: true }); // arrowing through tabs should not stack history entries
    document.getElementById(`tab-${TABS[next].id}`)?.focus();
  };

  return (
    <div className="min-h-app pb-10">
      <a
        href="#panel"
        onClick={(e) => {
          // Move focus without writing "#panel" into the address bar (and the history).
          e.preventDefault();
          document.getElementById('panel')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-emerald-500"
      >
        Skip to content
      </a>
      <header
        className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur"
        // Keeps the title clear of the notch / status bar when installed on a phone.
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className={`${GUTTER} flex flex-col gap-2 pt-3 sm:flex-row sm:items-center sm:gap-6`}>
          <h1 className="pb-1 text-lg font-semibold tracking-tight">
            <button
              type="button"
              onClick={openSettings}
              aria-label={showSettings ? 'Pocket Book: close settings' : 'Pocket Book: open settings'}
              title="Settings"
              className={`group -ml-2 flex items-center gap-2 rounded-lg px-2 py-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                showSettings ? 'bg-emerald-50 text-emerald-800' : 'hover:bg-slate-100'
              }`}
            >
              <img src="./favicon.svg" alt="" className="h-7 w-7" />
              Pocket Book
              <Icon
                name="settings"
                className={`h-4 w-4 transition group-hover:rotate-45 ${
                  showSettings ? 'text-emerald-700' : 'text-slate-400 group-hover:text-slate-600'
                }`}
              />
              {signedIn && (
                // Sync health at a glance, visible from every tab (details are in Settings).
                <span
                  className={`h-2 w-2 rounded-full ${DOT[status] || DOT.idle}`}
                  title={DOT_LABEL[status] || DOT_LABEL.idle}
                >
                  <span className="sr-only">{DOT_LABEL[status] || DOT_LABEL.idle}</span>
                </span>
              )}
            </button>
          </h1>
          <nav
            className="-mb-px flex flex-1 gap-1 overflow-x-auto"
            role="tablist"
            aria-label="Modules"
          >
            {TABS.map((t, i) => {
              const active = !showSettings && tab === t.id;
              return (
                <button
                  key={t.id}
                  id={`tab-${t.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="panel"
                  tabIndex={tab === t.id ? 0 : -1}
                  onClick={() => goToTab(t.id)}
                  onKeyDown={(e) => onTabKeyDown(e, i)}
                  className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                    active
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                  }`}
                >
                  <Icon name={t.icon} className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {storageBroken && (
        <div
          role="alert"
          className={`${GUTTER} mt-4`}
        >
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              Your browser is blocking or has run out of local storage. Changes are kept only until you
              close this window — free up space or leave private browsing to save them.
            </span>
          </div>
        </div>
      )}

      {/* A crash in one section must not take the header and tabs down with it; switching tab retries. */}
      {showSettings ? (
        <main id="panel" tabIndex={-1} aria-labelledby="settings-title" className={`${GUTTER} py-6 focus:outline-none`}>
          <ErrorBoundary variant="panel" resetKey="settings">
            <Settings onClose={closeSettings} />
          </ErrorBoundary>
        </main>
      ) : (
        <main id="panel" tabIndex={-1} role="tabpanel" aria-labelledby={`tab-${tab}`} className={`${GUTTER} py-6 focus:outline-none`}>
          <ErrorBoundary variant="panel" resetKey={tab}>
            {tab === 'dashboard' && <Dashboard onNavigate={goToTab} />}
            {tab === 'transactions' && <Transactions />}
            {tab === 'budgets' && <Budgets />}
            {tab === 'subscriptions' && <Subscriptions />}
            {tab === 'calculator' && <Calculator />}
          </ErrorBoundary>
        </main>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <UndoProvider>
        <SyncProvider>
          <Shell />
        </SyncProvider>
      </UndoProvider>
    </AppProvider>
  );
}
