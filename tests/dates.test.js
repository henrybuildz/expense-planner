import { describe, expect, it } from 'vitest';
import {
  addCycle,
  addDays,
  addMonths,
  currentMonthKey,
  daysUntil,
  isValidISO,
  lastMonthKeys,
  monthKey,
  startOfWeek,
  toISO,
} from '../src/utils/dates';

describe('isValidISO', () => {
  it('accepts normal dates and the supported range edges', () => {
    ['2026-10-07', '1900-01-01', '2100-12-31', '2024-02-29'].forEach((d) => expect(isValidISO(d)).toBe(true));
  });

  it('rejects impossible calendar dates', () => {
    ['2026-02-31', '2026-13-01', '2026-00-10', '2025-02-29', '2026-04-31'].forEach((d) =>
      expect(isValidISO(d)).toBe(false)
    );
  });

  it('rejects out-of-range years and wrong shapes/types', () => {
    ['0002-01-01', '1899-12-31', '2101-01-01', '2026-1-1', '20260101', '', null, undefined, 20260101, {}].forEach((d) =>
      expect(isValidISO(d)).toBe(false)
    );
  });
});

describe('addMonths / addCycle (month-end handling)', () => {
  it('clamps to the last day of a short month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // leap year
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('does NOT drift when given the anchor day: Jan 31 > Feb 28 > Mar 31 > Apr 30 > May 31', () => {
    // Regression: without an anchor a bill due on the 31st slid permanently to the 28th.
    const seq = ['2026-01-31'];
    for (let i = 0; i < 4; i += 1) seq.push(addCycle(seq[i], 'monthly', 31));
    expect(seq).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('shows the drift the anchor prevents (documents why the anchor exists)', () => {
    let d = '2026-01-31';
    for (let i = 0; i < 4; i += 1) d = addCycle(d, 'monthly'); // no anchor
    expect(d).toBe('2026-05-28');
  });

  it('handles every cycle length', () => {
    expect(addCycle('2026-10-01', 'weekly')).toBe('2026-10-08');
    expect(addCycle('2026-10-01', 'biweekly')).toBe('2026-10-15');
    expect(addCycle('2026-10-01', 'monthly', 1)).toBe('2026-11-01');
    expect(addCycle('2026-10-01', 'quarterly', 1)).toBe('2027-01-01');
    expect(addCycle('2026-10-01', 'yearly', 1)).toBe('2027-10-01');
    expect(addCycle('2024-02-29', 'yearly', 29)).toBe('2025-02-28'); // leap day
  });

  it('crosses year boundaries and daylight-saving changes correctly', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // spans the EU clock change
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });
});

describe('startOfWeek (weeks run Monday to Sunday)', () => {
  const cases = [
    ['2026-10-05', '2026-10-05'], // Monday stays
    ['2026-10-07', '2026-10-05'], // Wednesday
    ['2026-10-11', '2026-10-05'], // Sunday belongs to the week that started Monday
    ['2026-10-12', '2026-10-12'], // next Monday starts a new week
    ['2026-01-01', '2025-12-29'], // crosses the year
    ['2027-01-03', '2026-12-28'],
    ['2024-03-01', '2024-02-26'], // leap year
  ];
  it.each(cases)('%s -> week starts %s', (input, monday) => {
    expect(startOfWeek(input)).toBe(monday);
    expect(new Date(`${monday}T12:00:00`).getDay()).toBe(1);
  });
});

describe('daysUntil / month keys', () => {
  it('counts whole days using an injected "today"', () => {
    expect(daysUntil('2026-10-10', '2026-10-07')).toBe(3);
    expect(daysUntil('2026-10-07', '2026-10-07')).toBe(0);
    expect(daysUntil('2026-10-01', '2026-10-07')).toBe(-6);
    expect(daysUntil('2026-03-30', '2026-03-28')).toBe(2); // across DST
  });

  it('builds month keys ending at the month of "today"', () => {
    expect(lastMonthKeys(6, '2026-10-08')).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(lastMonthKeys(3, '2026-01-15')).toEqual(['2025-11', '2025-12', '2026-01']);
    expect(currentMonthKey('2026-10-08')).toBe('2026-10');
    expect(monthKey('2026-10-08')).toBe('2026-10');
  });

  it('toISO uses the local calendar day', () => {
    expect(toISO(new Date(2026, 9, 7, 23, 59, 59))).toBe('2026-10-07');
    expect(toISO(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
  });
});
