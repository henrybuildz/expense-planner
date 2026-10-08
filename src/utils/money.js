import { CURRENCY } from '../constants/currency';
import { parseAmount } from './format';

export const MAX_AMOUNT = 1e9;

export const toCents = (n) => Math.round((n + Number.EPSILON) * 100);

// Sums in integer cents so 0.1 + 0.2 style float drift never reaches the UI
// (and "exactly on budget" comparisons stay exact).
export const sumMoney = (values) => values.reduce((acc, n) => acc + toCents(n), 0) / 100;

/**
 * Validates and normalises a user-typed money value.
 * Rounds to cents FIRST and then checks > 0, so "0.004" is rejected instead of
 * being saved as 0 and silently dropped by the loader on the next visit.
 * Returns { value } on success or { error } with a message for the field.
 */
export function parseMoney(input) {
  const n = parseAmount(input);
  if (!Number.isFinite(n)) return { error: 'Enter an amount greater than 0.' };
  // "0", "0.00" and "0.004" (typing stops at 2 decimals, so "0.005" arrives as "0.00") are not greater than
  // nothing in a useful sense; say what the minimum actually is instead of a confusing "greater than 0".
  if (n <= 0 || toCents(n) < 1) return { error: `The smallest amount is ${CURRENCY.symbol}0.01.` };
  if (n > MAX_AMOUNT) return { error: 'Amount is too large.' };
  const cents = toCents(n);
  return { value: cents / 100 };
}
