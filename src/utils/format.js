import { CURRENCY } from '../constants/currency';

const money = new Intl.NumberFormat(CURRENCY.locale, { style: 'currency', currency: CURRENCY.code });

export const formatMoney = (n) => money.format(Number.isFinite(n) ? n : 0);

export const formatPercent = (n, digits = 0) => `${(n || 0).toFixed(digits)}%`;

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Parses a user-typed amount; returns NaN when it is not a finite number.
export const parseAmount = (value) => (value === '' || value == null ? NaN : Number(value));
