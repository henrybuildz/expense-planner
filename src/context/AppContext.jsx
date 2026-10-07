import { createContext, useCallback, useContext, useMemo } from 'react';
import { KEYS } from '../constants/storage';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { addCycle, addDays, addMonths, todayISO } from '../utils/dates';
import { uid } from '../utils/format';
import {
  sanitizeBudgets,
  sanitizeSubscriptions,
  sanitizeTransactions,
} from '../utils/sanitize';

const AppContext = createContext(null);

const dayOf = (iso) => Number(iso.slice(8));

const EMPTY_LIST = [];
const EMPTY_MAP = {};

// Demo data relative to today, so the dashboard looks alive on first run.
function buildSampleData() {
  const today = todayISO();
  const tx = (type, amount, category, daysAgo, notes) => ({
    id: uid(),
    type,
    amount,
    category,
    date: addDays(today, -daysAgo),
    notes,
  });
  const transactions = [];
  const todayDay = Number(today.slice(8));
  for (let m = 0; m < 6; m++) {
    const base = addMonths(today, -m);
    // Never date sample entries after today in the current month.
    const at = (day) => `${base.slice(0, 8)}${String(m === 0 ? Math.min(day, todayDay) : day).padStart(2, '0')}`;
    transactions.push(
      { id: uid(), type: 'income', amount: 4200, category: 'Salary', date: at(1), notes: 'Monthly salary' },
      { id: uid(), type: 'expense', amount: 1350, category: 'Housing', date: at(2), notes: 'Rent' },
      { id: uid(), type: 'expense', amount: 140 + m * 12, category: 'Food', date: at(8), notes: 'Groceries' },
      { id: uid(), type: 'expense', amount: 85, category: 'Transport', date: at(12), notes: 'Fuel & transit' },
      { id: uid(), type: 'expense', amount: 120, category: 'Bills', date: at(15), notes: 'Utilities' },
      { id: uid(), type: 'expense', amount: 60 + m * 9, category: 'Entertainment', date: at(20), notes: 'Movies & dining out' }
    );
  }
  transactions.push(
    tx('income', 450, 'Freelance', 3, 'Logo project'),
    tx('expense', 38.5, 'Food', 1, 'Lunch with team'),
    tx('expense', 64, 'Health', 2, 'Pharmacy')
  );
  const today0 = todayISO();
  const subscriptions = [
    { id: uid(), name: 'Netflix', cost: 15.49, cycle: 'monthly', nextDue: addDays(today0, 3), lastPaid: '' },
    { id: uid(), name: 'Spotify', cost: 10.99, cycle: 'monthly', nextDue: addDays(today0, 12), lastPaid: '' },
    { id: uid(), name: 'Cloud storage', cost: 99, cycle: 'yearly', nextDue: addDays(today0, 40), lastPaid: '' },
  ];
  const budgets = { Food: 400, Transport: 120, Entertainment: 100, Housing: 1400 };
  return { transactions, subscriptions, budgets };
}

export function AppProvider({ children }) {
  const [transactions, setTransactions] = useLocalStorage(
    KEYS.transactions,
    EMPTY_LIST,
    sanitizeTransactions
  );
  const [budgets, setBudgets] = useLocalStorage(KEYS.budgets, EMPTY_MAP, sanitizeBudgets);
  const [subscriptions, setSubscriptions] = useLocalStorage(
    KEYS.subscriptions,
    EMPTY_LIST,
    sanitizeSubscriptions
  );

  const addTransaction = useCallback(
    (t) => setTransactions((prev) => [{ ...t, id: uid() }, ...prev]),
    [setTransactions]
  );
  const updateTransaction = useCallback(
    (id, patch) =>
      setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t))),
    [setTransactions]
  );
  const deleteTransaction = useCallback(
    (id) => setTransactions((prev) => prev.filter((t) => t.id !== id)),
    [setTransactions]
  );

  const setBudget = useCallback(
    (category, limit) => setBudgets((prev) => ({ ...prev, [category]: limit })),
    [setBudgets]
  );
  const removeBudget = useCallback(
    (category) =>
      setBudgets((prev) => {
        const next = { ...prev };
        delete next[category];
        return next;
      }),
    [setBudgets]
  );

  const addSubscription = useCallback(
    (s) =>
      setSubscriptions((prev) => [
        ...prev,
        { lastPaid: '', ...s, anchorDay: dayOf(s.nextDue), id: uid() },
      ]),
    [setSubscriptions]
  );
  const updateSubscription = useCallback(
    (id, patch) =>
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, ...patch, ...(patch.nextDue ? { anchorDay: dayOf(patch.nextDue) } : {}) }
            : s
        )
      ),
    [setSubscriptions]
  );
  const deleteSubscription = useCallback(
    (id) => setSubscriptions((prev) => prev.filter((s) => s.id !== id)),
    [setSubscriptions]
  );
  const markSubscriptionPaid = useCallback(
    (id) =>
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, lastPaid: todayISO(), nextDue: addCycle(s.nextDue, s.cycle, s.anchorDay) }
            : s
        )
      ),
    [setSubscriptions]
  );

  const loadSampleData = useCallback(() => {
    const sample = buildSampleData();
    setTransactions((prev) => [...sample.transactions, ...prev]);
    setSubscriptions((prev) => [...prev, ...sample.subscriptions]);
    setBudgets((prev) => ({ ...sample.budgets, ...prev }));
  }, [setTransactions, setSubscriptions, setBudgets]);

  // `data` comes from parseBackup(): already sanitized, and only holds sections present in the file.
  const replaceAll = useCallback(
    (data) => {
      if (data.transactions) setTransactions(data.transactions);
      if (data.budgets) setBudgets(data.budgets);
      if (data.subscriptions) setSubscriptions(data.subscriptions);
    },
    [setTransactions, setBudgets, setSubscriptions]
  );

  // Merge keeps everything you have; records whose id already exists are skipped, and
  // an imported budget replaces the budget for the same category.
  const mergeAll = useCallback(
    (data) => {
      const addNew = (incoming) => (prev) => {
        const have = new Set(prev.map((item) => item.id));
        return [...incoming.filter((item) => !have.has(item.id)), ...prev];
      };
      if (data.transactions) setTransactions(addNew(data.transactions));
      if (data.budgets) setBudgets((prev) => ({ ...prev, ...data.budgets }));
      if (data.subscriptions) setSubscriptions(addNew(data.subscriptions));
    },
    [setTransactions, setBudgets, setSubscriptions]
  );

  const value = useMemo(
    () => ({
      transactions,
      budgets,
      subscriptions,
      replaceAll,
      mergeAll,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      setBudget,
      removeBudget,
      addSubscription,
      updateSubscription,
      deleteSubscription,
      markSubscriptionPaid,
      loadSampleData,
    }),
    [
      transactions,
      budgets,
      subscriptions,
      replaceAll,
      mergeAll,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      setBudget,
      removeBudget,
      addSubscription,
      updateSubscription,
      deleteSubscription,
      markSubscriptionPaid,
      loadSampleData,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
