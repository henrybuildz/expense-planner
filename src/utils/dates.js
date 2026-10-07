// Dates are stored as local 'YYYY-MM-DD' strings (no timezone surprises).
const pad = (n) => String(n).padStart(2, '0');

export const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

// Sane bounds: rejects typos like 0002-01-01 and keeps sort/format predictable.
export const MIN_DATE = '1900-01-01';
export const MAX_DATE = '2100-12-31';

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayISO = () => toISO(new Date());

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidISO(iso) {
  if (typeof iso !== 'string' || !ISO_RE.test(iso)) return false;
  if (iso < MIN_DATE || iso > MAX_DATE) return false;
  return toISO(parseISO(iso)) === iso; // rejects 2026-02-31
}

export const monthKey = (iso) => iso.slice(0, 7);

// `today` is injectable so long-lived windows can pass a refreshed date (see useToday).
export const currentMonthKey = (today = todayISO()) => today.slice(0, 7);

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// Adds months, clamping to the month's last day (Jan 31 + 1 month = Feb 28/29).
// `anchorDay` is the day-of-month the bill is *meant* to fall on, so a clamped
// month does not permanently drag later dates down (Jan 31 > Feb 28 > Mar 31).
export function addMonths(iso, n, anchorDay) {
  const d = parseISO(iso);
  const day = anchorDay || d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}

export function addCycle(iso, cycle, anchorDay) {
  switch (cycle) {
    case 'weekly':
      return addDays(iso, 7);
    case 'biweekly':
      return addDays(iso, 14);
    case 'quarterly':
      return addMonths(iso, 3, anchorDay);
    case 'yearly':
      return addMonths(iso, 12, anchorDay);
    case 'monthly':
    default:
      return addMonths(iso, 1, anchorDay);
  }
}

export function daysUntil(iso, today = todayISO()) {
  return Math.round((parseISO(iso) - parseISO(today)) / 86400000);
}

export function formatDate(iso) {
  return parseISO(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
}

// ['2026-05', ..., '2026-10'] ending at the month of `today`.
export function lastMonthKeys(count, today = todayISO()) {
  const now = parseISO(today);
  const keys = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return keys;
}
