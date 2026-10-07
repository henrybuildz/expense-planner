// Backup file format (JSON):
//   { app: 'expense-planner', version: 1, exportedAt, currency,
//     data: { transactions: [...], budgets: {...}, subscriptions: [...] } }
import { CURRENCY } from '../constants/currency';
import { sanitizeBudgets, sanitizeSubscriptions, sanitizeTransactions } from './sanitize';

export const BACKUP_APP = 'expense-planner';
export const BACKUP_VERSION = 1;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const SECTIONS = {
  transactions: sanitizeTransactions,
  budgets: sanitizeBudgets,
  subscriptions: sanitizeSubscriptions,
};

const size = (v) => (Array.isArray(v) ? v.length : Object.keys(v).length);
const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function buildBackup({ transactions, budgets, subscriptions }, now = new Date()) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    currency: CURRENCY.code,
    data: { transactions, budgets, subscriptions },
  };
}

/**
 * Validates the text of a backup file. Never throws.
 * Returns { error } or { data, skipped, currencyNote }, where `data` holds only the
 * sections present in the file, already cleaned by the same sanitizers used on load,
 * and `skipped` counts records that were dropped as invalid.
 */
export function parseBackup(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'That file is not valid JSON.' };
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP) {
    return { error: 'This is not an Expense Planner backup file.' };
  }
  if (!Number.isInteger(raw.version) || raw.version < 1 || raw.version > BACKUP_VERSION) {
    return { error: 'This backup was made by a newer version of the app and cannot be read.' };
  }
  if (!isObject(raw.data)) return { error: 'The backup has no data section.' };

  const data = {};
  let skipped = 0;
  for (const [key, clean] of Object.entries(SECTIONS)) {
    if (!has(raw.data, key)) continue;
    const value = clean(raw.data[key]);
    if (value === undefined) return { error: `The "${key}" section of the backup is damaged.` };
    data[key] = value;
    skipped += size(raw.data[key]) - size(value);
  }
  if (Object.keys(data).length === 0) return { error: 'The backup contains no data.' };

  const currencyNote =
    typeof raw.currency === 'string' && raw.currency !== CURRENCY.code
      ? `This backup was made in ${raw.currency.slice(0, 8)}. Amounts are imported as-is and are not converted to ${CURRENCY.code}.`
      : '';
  return { data, skipped, currencyNote };
}
