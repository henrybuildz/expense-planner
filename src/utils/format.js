import { CURRENCY } from '../constants/currency';

// MAX_AMOUNT is 1e9 (10 digits). The field used to take 12 digits and then refuse the value on save.
const MAX_INT_DIGITS = 10;

const money = new Intl.NumberFormat(CURRENCY.locale, { style: 'currency', currency: CURRENCY.code });

// A real minus sign (U+2212) instead of the hyphen: a hyphen is a line-break opportunity, so a long
// negative amount used to wrap with the "-" alone on the line above the number.
export const formatMoney = (n) => money.format(Number.isFinite(n) ? n : 0).replace(/^-/, '\u2212');

export const formatPercent = (n, digits = 0) => {
  const text = (n || 0).toFixed(digits);
  // "-0.4" rounds to "-0": show 0%, never "−0%".
  return /^-0(\.0+)?$/.test(text) ? `${text.slice(1)}%` : `${text.replace(/^-/, '\u2212')}%`;
};

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Cleans text as the user types into a money (or whole-number) field: digits plus at most one
// "." or "," separator, at most 2 decimals. Anything else (letters, minus, spaces) is dropped.
export function cleanNumberText(text, { integer = false } = {}) {
  if (integer) return text.replace(/\D/g, '').slice(0, 6);
  const kept = text.replace(/[^\d.,]/g, '');
  const at = kept.search(/[.,]/);
  if (at === -1) return kept.slice(0, MAX_INT_DIGITS);
  const decimals = kept.slice(at + 1).replace(/[.,]/g, '').slice(0, 2);
  return `${kept.slice(0, at).slice(0, MAX_INT_DIGITS)}${kept[at]}${decimals}`;
}

// Turns PASTED text like "1,234.56", "1.234,56", "€ 1 234,50" or "1,000,000" into a plain amount.
// Typing is handled by cleanNumberText (visible, character by character); pasting needs a guess about
// which separator is the decimal point, otherwise "1,234.56" would silently become 1.23.
export function normalizePastedAmount(text) {
  const t = text.replace(/[^\d.,]/g, ''); // drops currency signs, spaces (incl. non-breaking), apostrophes
  const at = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','));
  if (at === -1) return t;
  const mark = t[at];
  const before = t.slice(0, at);
  const after = t.slice(at + 1);
  const hasBoth = t.includes('.') && t.includes(',');
  const repeated = t.split(mark).length - 1 > 1;
  // "1,234.56" / "1.234,56": the last separator is the decimal point. "1.234.567": grouping only.
  // A lone separator followed by exactly 3 digits ("1,234") is grouping, except "0,125".
  const isDecimal = hasBoth || (!repeated && !(after.length === 3 && before !== '' && before !== '0'));
  return isDecimal ? `${before.replace(/[.,]/g, '')}${mark}${after}` : t.replace(/[.,]/g, '');
}

// Parses a user-typed amount; accepts "12.5" and "12,5" (euro style). NaN when not a plain number.
export function parseAmount(value) {
  if (value === '' || value == null) return NaN;
  const text = String(value).trim().replace(',', '.');
  return /^\d*\.?\d*$/.test(text) && /\d/.test(text) ? Number(text) : NaN;
}
