// Single source of truth for period conversion. Everything is converted via
// an annual amount: amount x perYear[from] = per-year, then / perYear[to].
export const PERIODS = [
  { id: 'daily', label: 'Daily', noun: 'day', perYear: 365 },
  { id: 'weekly', label: 'Weekly', noun: 'week', perYear: 52 },
  { id: 'biweekly', label: 'Bi-weekly', noun: '2 weeks', perYear: 26 },
  { id: 'monthly', label: 'Monthly', noun: 'month', perYear: 12 },
  { id: 'quarterly', label: 'Quarterly', noun: 'quarter', perYear: 4 },
  { id: 'yearly', label: 'Yearly', noun: 'year', perYear: 1 },
];

// Billing cycles for subscriptions (a daily bill is not a realistic cycle).
export const CYCLES = PERIODS.filter((p) => p.id !== 'daily');

export const periodById = (id) => PERIODS.find((p) => p.id === id);

export const isCycle = (id) => CYCLES.some((c) => c.id === id);

export const toAnnual = (amount, periodId) => amount * periodById(periodId).perYear;

export const convert = (amount, from, to) =>
  (amount * periodById(from).perYear) / periodById(to).perYear;
