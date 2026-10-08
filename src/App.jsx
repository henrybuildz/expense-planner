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
import Icon from './components/ui/Icon';
import DataBackup from './components/backup/DataBackup';
import AccountSync from './components/account/AccountSync';
import Dashboard from './components/dashboard/Dashboard';
import Transactions from './components/transactions/Transactions';
import Budgets from './components/budgets/Budgets';
import Subscriptions from './components/subscriptions/Subscriptions';
import Calculator from './components/calculator/Calculator';

function Shell() {
  const [tab, setTab] = useLocalStorage(KEYS.tab, 'dashboard', sanitizeTab);
  const [storageBroken, setStorageBroken] = useState(hasStorageFailed);

  useEffect(() => {
    const onFail = () => setStorageBroken(true);
    window.addEventListener(STORAGE_ERROR_EVENT, onFail);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, onFail);
  }, []);

  // WAI-ARIA tabs pattern: arrow keys / Home / End move between tabs.
  const onTabKeyDown = (e, index) => {
    let next;
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[next].id);
    document.getElementById(`tab-${TABS[next].id}`)?.focus();
  };

  return (
    <div className="min-h-screen pb-10">
      <header
        className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur"
        // Keeps the title clear of the notch / status bar when installed on a phone.
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 pt-3 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-center gap-2 pb-1">
            <img src="./favicon.svg" alt="" className="h-7 w-7" />
            <h1 className="text-lg font-semibold tracking-tight">Expense Planner</h1>
          </div>
          <nav
            className="-mb-px flex flex-1 gap-1 overflow-x-auto"
            role="tablist"
            aria-label="Modules"
          >
            {TABS.map((t, i) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  id={`tab-${t.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="panel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => setTab(t.id)}
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
          className="mx-auto mt-4 flex max-w-6xl items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200"
        >
          <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            Your browser is blocking or has run out of local storage. Changes are kept only until you
            close this window — free up space or leave private browsing to save them.
          </span>
        </div>
      )}

      <main
        id="panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="mx-auto max-w-6xl px-4 py-6"
      >
        {tab === 'dashboard' && <Dashboard onNavigate={setTab} />}
        {tab === 'transactions' && <Transactions />}
        {tab === 'budgets' && <Budgets />}
        {tab === 'subscriptions' && <Subscriptions />}
        {tab === 'calculator' && <Calculator />}
      </main>

      <footer className="mx-auto max-w-6xl space-y-4 px-4">
        <AccountSync />
        <DataBackup />
      </footer>
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
