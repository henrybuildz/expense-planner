import { useEffect, useState } from 'react';
import { AppProvider } from './context/AppContext';
import { SyncProvider } from './context/SyncContext';
import { TABS } from './constants/tabs';
import { KEYS } from './constants/storage';
import {
  STORAGE_ERROR_EVENT,
  hasStorageFailed,
  useLocalStorage,
} from './hooks/useLocalStorage';
import { sanitizeTab } from './utils/sanitize';
import { RETURN_TO_SETTINGS_KEY, useSync } from './context/SyncContext';
import Icon from './components/ui/Icon';
import Dashboard from './components/dashboard/Dashboard';
import Transactions from './components/transactions/Transactions';
import Budgets from './components/budgets/Budgets';
import Subscriptions from './components/subscriptions/Subscriptions';
import Calculator from './components/calculator/Calculator';
import Settings from './components/settings/Settings';

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
  const [tab, setTab] = useLocalStorage(KEYS.tab, 'dashboard', sanitizeTab);
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
      if (e.key === 'Escape') setShowSettings(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSettings]);

  const goToTab = (id) => {
    setShowSettings(false);
    setTab(id);
  };

  const openSettings = () => {
    setShowSettings((open) => !open);
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
    goToTab(TABS[next].id);
    document.getElementById(`tab-${TABS[next].id}`)?.focus();
  };

  return (
    <div className="min-h-screen pb-10">
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

      {showSettings ? (
        <main id="panel" aria-labelledby="settings-title" className={`${GUTTER} py-6`}>
          <Settings onClose={() => setShowSettings(false)} />
        </main>
      ) : (
        <main id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className={`${GUTTER} py-6`}>
          {tab === 'dashboard' && <Dashboard onNavigate={goToTab} />}
          {tab === 'transactions' && <Transactions />}
          {tab === 'budgets' && <Budgets />}
          {tab === 'subscriptions' && <Subscriptions />}
          {tab === 'calculator' && <Calculator />}
        </main>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <SyncProvider>
        <Shell />
      </SyncProvider>
    </AppProvider>
  );
}
