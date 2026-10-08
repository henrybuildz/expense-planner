import { describe, expect, it } from 'vitest';
import { cleanNumberText, formatMoney, normalizePastedAmount, parseAmount, uid } from '../src/utils/format';
import { MAX_AMOUNT, parseMoney, sumMoney, toCents } from '../src/utils/money';
import { convert, toAnnual } from '../src/constants/periods';

describe('parseAmount', () => {
  it('accepts dot and comma decimals', () => {
    expect(parseAmount('42.5')).toBe(42.5);
    expect(parseAmount('42,5')).toBe(42.5);
    expect(parseAmount('.5')).toBe(0.5);
    expect(parseAmount(',5')).toBe(0.5);
    expect(parseAmount('5.')).toBe(5);
    expect(parseAmount('00012.50')).toBe(12.5);
    expect(parseAmount(' 3 ')).toBe(3);
    expect(parseAmount(12)).toBe(12);
  });

  it('returns NaN for anything that is not a plain number', () => {
    ['', ' ', '.', ',', '1,5,5', '1e3', '-1', 'abc', '0x10', null, undefined, NaN, Infinity].forEach((v) =>
      expect(parseAmount(v)).toBeNaN()
    );
  });
});

describe('parseMoney (validation + rounding to cents)', () => {
  it('rounds to cents first, then checks it is at least 0.01', () => {
    // Regression: 0.004 used to pass ">0", round to 0 and be silently dropped on reload.
    expect(parseMoney('0.004').error).toMatch(/smallest amount/i);
    expect(parseMoney('0.005')).toEqual({ value: 0.01 });
    expect(parseMoney('1.005')).toEqual({ value: 1.01 });
    expect(parseMoney('12,50')).toEqual({ value: 12.5 });
  });

  it('rejects empty, zero, negative, junk and oversized values', () => {
    expect(parseMoney('').error).toBeTruthy();
    expect(parseMoney('0').error).toBeTruthy();
    expect(parseMoney('-5').error).toBeTruthy();
    expect(parseMoney('abc').error).toBeTruthy();
    expect(parseMoney(String(MAX_AMOUNT + 0.01)).error).toMatch(/too large/i);
    expect(parseMoney('1e12').error).toBeTruthy();
  });

  it('accepts the maximum exactly', () => {
    expect(parseMoney(String(MAX_AMOUNT))).toEqual({ value: MAX_AMOUNT });
  });
});

describe('cent-exact arithmetic', () => {
  it('avoids floating point drift', () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the problem
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney([33.33, 33.33, 33.33])).toBe(99.99);
    expect(sumMoney([])).toBe(0);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(0.29)).toBe(29); // 0.29 * 100 = 28.999999999999996 in plain JS
  });
});

describe('cleanNumberText (what stays in the box while typing)', () => {
  it.each([
    ['42.5', '42.5'],
    ['42,5', '42,5'], // keeps the separator the user chose
    ['abc', ''],
    ['-5', '5'], // direction comes from the Income/Expense toggle
    ['1e3', '13'],
    ['12.345', '12.34'], // two decimals at most
    ['1.2.3', '1.23'],
    ['  9 ', '9'],
    ['€12', '12'],
    ['', ''],
    ['١٢٣', ''], // non-ASCII digits are dropped, not misread
  ])('%j -> %j', (typed, kept) => expect(cleanNumberText(typed)).toBe(kept));

  it('caps length and supports whole-number mode', () => {
    expect(cleanNumberText('1'.repeat(30))).toHaveLength(12);
    expect(cleanNumberText('12.5x', { integer: true })).toBe('125');
    expect(cleanNumberText('9999999', { integer: true })).toBe('999999');
  });
});

describe('normalizePastedAmount (thousands separators)', () => {
  // Regression: "1,234.56" used to be saved as 1.23, a silent 1000x error.
  const pasteToValue = (text) => parseAmount(cleanNumberText(normalizePastedAmount(text)));

  it.each([
    ['1,234.56', 1234.56],
    ['1.234,56', 1234.56],
    ['€ 1.234,50', 1234.5],
    ['1,234', 1234],
    ['1.234', 1234],
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['0,125', 0.12],
    ['1 234,50', 1234.5],
    ["1'234.50", 1234.5],
    ['1,000,000.00', 1000000],
    ['1.000.000', 1000000],
    ['EUR 99', 99],
    [' 12,40 €', 12.4],
    ['-45,00', 45],
    ['(45.00)', 45],
    ['.99', 0.99],
    ['1,5', 1.5],
  ])('pasting %j gives %d', (pasted, expected) => expect(pasteToValue(pasted)).toBe(expected));

  it('gives nothing for text with no number', () => {
    expect(pasteToValue('hello')).toBeNaN();
    expect(pasteToValue('')).toBeNaN();
  });
});

describe('formatMoney (euro display)', () => {
  it('formats with the euro sign and two decimals', () => {
    expect(formatMoney(1234.5)).toBe('€1,234.50');
    expect(formatMoney(-5)).toBe('-€5.00');
    expect(formatMoney(0)).toBe('€0.00');
  });
  it('never prints NaN', () => {
    expect(formatMoney(NaN)).toBe('€0.00');
    expect(formatMoney(undefined)).toBe('€0.00');
  });
});

describe('period conversion (calculator)', () => {
  it('converts through a yearly amount with the documented factors', () => {
    expect(toAnnual(50, 'weekly')).toBe(2600);
    expect(convert(50, 'weekly', 'monthly')).toBeCloseTo(216.6667, 4);
    expect(convert(50, 'weekly', 'quarterly')).toBe(650);
    expect(convert(100, 'monthly', 'yearly')).toBe(1200);
    expect(convert(10, 'daily', 'yearly')).toBe(3650);
    expect(convert(42, 'monthly', 'monthly')).toBe(42);
  });
});

describe('uid', () => {
  it('produces unique ids that are safe to send in sync requests', () => {
    const ids = new Set(Array.from({ length: 500 }, () => uid()));
    expect(ids.size).toBe(500);
    ids.forEach((id) => expect(id).toMatch(/^[A-Za-z0-9_.-]{1,64}$/));
  });
});
