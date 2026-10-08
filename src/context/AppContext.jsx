import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { KEYS } from '../constants/storage';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { addCycle, todayISO } from '../utils/dates';
import { EMPTY_BACKUP_STATUS, snoozeDate } from '../utils/backupStatus';
import { uid } from '../utils/format';
import {
  sanitizeBackupStatus,
  sanitizeBudgets,
  sanitizeSubscriptions,
  sanitizeTransactions,
} from '../utils/sanitize';

const AppContext = createContext(null);

const dayOf = (iso) => Number(iso.slice(8));

const EMPTY_LIST = [];
const EMPTY_MAP = {};

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

  // Backup bookkeeping (dates only). `since` = when we first saw data, the starting point for the first reminder.
  const [backupStatus, setBackupStatus] = useLocalStorage(KEYS.backupStatus, EMPTY_BACKUP_STATUS, sanitizeBackupStatus);
  const hasData = transactions.length > 0 || Object.keys(budgets).length > 0 || subscriptions.length > 0;
  useEffect(() => {
    if (hasData && !backupStatus.since) setBackupStatus((s) => ({ ...s, since: todayISO() }));
    if (!hasData && (backupStatus.since || backupStatus.snoozeUntil)) {
      setBackupStatus((s) => ({ ...s, since: null, snoozeUntil: null })); // everything was deleted: start over
    }
  }, [hasData, backupStatus.since, backupStatus.snoozeUntil, setBackupStatus]);
  const markBackedUp = useCallback(
    () => setBackupStatus((s) => ({ ...s, lastBackup: todayISO(), snoozeUntil: null })),
    [setBackupStatus]
  );
  const snoozeBackupNudge = useCallback(
    () => setBackupStatus((s) => ({ ...s, snoozeUntil: snoozeDate(todayISO()) })),
    [setBackupStatus]
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

  // Undo support: put back exactly what was deleted (same id, same fields). Never creates a duplicate,
  // and never overwrites something the user has since created in its place.
  const restoreTransaction = useCallback(
    (t) => setTransactions((prev) => (prev.some((x) => x.id === t.id) ? prev : [t, ...prev])),
    [setTransactions]
  );
  const restoreBudget = useCallback(
    (category, limit) =>
      setBudgets((prev) =>
        Object.prototype.hasOwnProperty.call(prev, category) ? prev : { ...prev, [category]: limit }
      ),
    [setBudgets]
  );
  const restoreSubscription = useCallback(
    (s) => setSubscriptions((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, s])),
    [setSubscriptions]
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

  // "Mark paid" for the UI: moves the due date AND records the payment as an expense, so Dashboard and
  // Budgets see what subscriptions really cost. Returns the new transaction's id so an Undo can remove it.
  const paySubscription = useCallback(
    (s) => {
      const txId = uid();
      const today = todayISO();
      setSubscriptions((prev) =>
        prev.map((x) =>
          x.id === s.id ? { ...x, lastPaid: today, nextDue: addCycle(x.nextDue, x.cycle, x.anchorDay) } : x
        )
      );
      setTransactions((prev) => [
        { id: txId, type: 'expense', amount: s.cost, category: 'Subscriptions', date: today, notes: s.name },
        ...prev,
      ]);
      return txId;
    },
    [setSubscriptions, setTransactions]
  );
  // Undo of paySubscription: put the previous dates back and drop the expense it recorded. Anything else
  // edited on the subscription meanwhile (name, cost) is kept.
  const undoPaySubscription = useCallback(
    (before, txId) => {
      setSubscriptions((prev) =>
        prev.map((x) =>
          x.id === before.id ? { ...x, lastPaid: before.lastPaid, nextDue: before.nextDue } : x
        )
      );
      setTransactions((prev) => prev.filter((t) => t.id !== txId));
    },
    [setSubscriptions, setTransactions]
  );

  // Used by the sync engine to apply changes pulled from the server. Always a functional update,
  // so edits made while a sync is in flight are never overwritten.
  const updateTable = useCallback(
    (name, updater) => {
      const setters = { transactions: setTransactions, budgets: setBudgets, subscriptions: setSubscriptions };
      setters[name](updater);
    },
    [setTransactions, setBudgets, setSubscriptions]
  );

  // Undo of a Replace import: take the imported records back out and put the previous ones back, while
  // leaving anything the user created since untouched (restoring a whole snapshot would erase it).
  const undoReplace = useCallback(
    (imported, before) => {
      const idsOf = (list) => new Set((list || []).map((x) => x.id));
      const swap = (prev, importedList, beforeList) => {
        const drop = idsOf(importedList);
        const kept = prev.filter((x) => !drop.has(x.id));
        const have = idsOf(kept);
        return [...beforeList.filter((x) => !have.has(x.id)), ...kept];
      };
      if (before.transactions) setTransactions((prev) => swap(prev, imported.transactions, before.transactions));
      if (before.subscriptions) setSubscriptions((prev) => swap(prev, imported.subscriptions, before.subscriptions));
      if (before.budgets) {
        setBudgets((prev) => {
          const next = { ...prev };
          Object.keys(imported.budgets || {}).forEach((category) => delete next[category]);
          return { ...next, ...before.budgets };
        });
      }
    },
    [setTransactions, setBudgets, setSubscriptions]
  );

  const clearAll = useCallback(() => {
    setTransactions([]);
    setBudgets({});
    setSubscriptions([]);
  }, [setTransactions, setBudgets, setSubscriptions]);

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
      hasData,
      backupStatus,
      markBackedUp,
      snoozeBackupNudge,
      replaceAll,
      mergeAll,
      clearAll,
      undoReplace,
      updateTable,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      restoreTransaction,
      restoreBudget,
      restoreSubscription,
      setBudget,
      removeBudget,
      addSubscription,
      updateSubscription,
      deleteSubscription,
      markSubscriptionPaid,
      paySubscription,
      undoPaySubscription,
    }),
    [
      transactions,
      budgets,
      subscriptions,
      hasData,
      backupStatus,
      markBackedUp,
      snoozeBackupNudge,
      updateTable,
      replaceAll,
      mergeAll,
      clearAll,
      undoReplace,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      restoreTransaction,
      restoreBudget,
      restoreSubscription,
      setBudget,
      removeBudget,
      addSubscription,
      updateSubscription,
      deleteSubscription,
      markSubscriptionPaid,
      paySubscription,
      undoPaySubscription,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
