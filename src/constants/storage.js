// All localStorage keys used by the app, in one place.
export const KEYS = {
  transactions: 'expense-planner:transactions',
  budgets: 'expense-planner:budgets',
  subscriptions: 'expense-planner:subscriptions',
  tab: 'expense-planner:tab',
  // When this device was last backed up (export) and when to remind again. Dates only, never your data.
  backupStatus: 'expense-planner:backup-status',
  // Sync bookkeeping: which account, how far we have pulled, and what the server last confirmed.
  sync: 'expense-planner:sync',
  // Raw copy of everything, written by the crash screen's "Start fresh" just before it clears the data.
  crashBackup: 'expense-planner:crash-backup',
  // Safety copy of your data, written just before an import replaces it.
  preImportBackup: 'expense-planner:pre-import-backup',
};
