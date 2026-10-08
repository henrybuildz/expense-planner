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

// Weeks run Monday to Sunday. Returns the Monday on or before `iso`.
export function startOfWeek(iso) {
  const daysSinceMonday = (parseISO(iso).getDay() + 6) % 7; // getDay(): 0 = Sunday
  return addDays(iso, -daysSinceMonday);
}

export function daysUntil(iso, today = todayISO()) {
  return Math.round((parseISO(iso) - parseISO(today)) / 86400000);
}

// How dates are shown: European DD/MM/YYYY, always. Plain string work on purpose: it must not follow the
// browser's language (a US browser would print "Oct 8, 2026") or the timezone. Stored dates stay YYYY-MM-DD.
export function formatDate(iso) {
  if (typeof iso !== 'string') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

const SEPARATORS = /[\s/.\-]+/;

/**
 * What the date box shows while someone types. Keeps digits, lets them type their own separators
 * (/ . - or space, so "8/1/2026" works) and otherwise inserts the slashes: 08102026 -> 08/10/2026.
 * Parts are capped at day 2, month 2, year 4. A pasted stored-format date (2026-10-08) is converted.
 * `deleting` stops a trailing slash being put straight back, so backspace can remove it.
 */
export function formatDateInput(text, { deleting = false } = {}) {
  const raw = String(text ?? '').normalize('NFKC'); // full-width digits and slashes (IME) become ordinary ones
  // A pasted stored-format date, optionally followed by a time (2026-10-08, 2026-10-08T00:00:00Z, 2026-10-08 14:30).
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/s.exec(raw.trim());
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  const clean = raw.replace(/[^\d\s/.\-]/g, '');
  let out;
  if (SEPARATORS.test(clean)) {
    const parts = clean.trimStart().split(SEPARATORS); // ends with '' right after a typed separator
    if (parts[0] === '') return '';
    const limits = [2, 2, 4];
    const shown = [];
    let carry = ''; // digits beyond a part's length flow into the next one: "08/10" + "2" -> "08/10/2"
    for (let i = 0; i < 3 && (i < parts.length || carry); i += 1) {
      const p = carry + (parts[i] ?? '');
      carry = i < 2 ? p.slice(limits[i]) : '';
      shown.push(p.slice(0, limits[i]));
    }
    out = shown.join('/');
  } else {
    const d = clean.replace(/\D/g, '').slice(0, 8);
    out = d.slice(0, 2) + (d.length > 2 ? `/${d.slice(2, 4)}` : '') + (d.length > 4 ? `/${d.slice(4, 8)}` : '');
  }
  return deleting ? out.replace(/\/$/, '') : out;
}

/**
 * Does a transaction's date match what someone typed in the search box? Matches the date as it is SHOWN
 * (08/10/2026) and without leading zeros (8/10/2026), so "9/3" finds 09/03/2026. Dots, dashes or spaces between
 * three parts (9.3.2026) count as slashes. Two parts with a dot (12.5) are never read as a date: that is an amount.
 */
export function dateMatchesQuery(iso, query) {
  const q = String(query ?? '').trim();
  if (!q) return true;
  const shown = formatDate(iso);
  if (shown === iso) return false; // not a stored date
  const plain = shown.replace(/(^|\/)0(?=\d)/g, '$1'); // 09/03/2026 -> 9/3/2026
  const typed = /^\d+([\s.-]+\d+){2}$/.test(q) ? q.replace(/[\s.-]+/g, '/') : q;
  return shown.includes(typed) || plain.includes(typed);
}

/** Typed text -> stored 'YYYY-MM-DD', or null when it is not a complete, real date between 1900 and 2100. */
export function parseDateInput(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim().normalize('NFKC');
  if (isValidISO(t)) return t; // already in the stored format
  const m = /^(\d{1,2})[\s/.\-](\d{1,2})[\s/.\-](\d{4})$/.exec(t) || /^(\d{2})(\d{2})(\d{4})$/.exec(t);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isValidISO(iso) ? iso : null;
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
