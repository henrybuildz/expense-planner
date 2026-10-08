// All localStorage keys used by the app, in one place.
export const KEYS = {
  transactions: 'expense-planner:transactions',
  budgets: 'expense-planner:budgets',
  subscriptions: 'expense-planner:subscriptions',
  tab: 'expense-planner:tab',
  // Sync bookkeeping: which account, how far we have pulled, and what the server last confirmed.
  sync: 'expense-planner:sync',
  // Safety copy of your data, written just before an import replaces it.
  preImportBackup: 'expense-planner:pre-import-backup',
};
