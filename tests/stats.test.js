import { describe, expect, it } from 'vitest';
import { spendingByCategory, summarize, weekSummary } from '../src/utils/stats';
import { startOfWeek } from '../src/utils/dates';

const tx = (id, type, amount, date, category = 'Food') => ({ id, type, amount, category, date, notes: '' });

describe('spendingByCategory', () => {
  const list = [
    tx('1', 'expense', 0.1, '2026-10-01'),
    tx('2', 'expense', 0.2, '2026-10-02'),
    tx('3', 'expense', 50, '2026-10-03', 'Bills'),
    tx('4', 'income', 999, '2026-10-03', 'Salary'),
    tx('5', 'expense', 7, '2026-09-30'), // other month
  ];

  it('totals expenses per category for one month, largest first', () => {
    const out = spendingByCategory(list, '2026-10');
    expect(out.map((c) => c.name)).toEqual(['Bills', 'Food']);
    expect(out[0].amount).toBe(50);
  });

  it('is cent-exact (0.1 + 0.2 = 0.3)', () => {
    expect(spendingByCategory(list, '2026-10').find((c) => c.name === 'Food').amount).toBe(0.3);
  });

  it('percentages add up to 100 and handle empty input', () => {
    const pct = spendingByCategory(list, '2026-10').reduce((n, c) => n + c.pct, 0);
    expect(pct).toBeCloseTo(100, 6);
    expect(spendingByCategory([], '2026-10')).toEqual([]);
  });

  it('ignores income and other months', () => {
    expect(spendingByCategory(list, '2026-09')).toEqual([{ name: 'Food', amount: 7, pct: 100 }]);
  });
});

describe('summarize (dashboard numbers)', () => {
  const today = '2026-10-08';
  const list = [
    tx('a', 'income', 4200, '2026-10-01', 'Salary'),
    tx('b', 'expense', 1350, '2026-10-02', 'Housing'),
    tx('c', 'expense', 0.1, '2026-10-03'),
    tx('d', 'expense', 0.2, '2026-10-03'),
    tx('e', 'income', 4200, '2026-09-01', 'Salary'),
    tx('f', 'expense', 100, '2026-09-10'),
  ];
  const s = summarize(list, today);

  it('splits this month from all time', () => {
    expect(s.monthIncome).toBe(4200);
    expect(s.monthExpense).toBe(1350.3);
    expect(s.net).toBe(2849.7);
    expect(s.balance).toBe(4200 + 4200 - 1350.3 - 100);
  });

  it('computes the savings rate, or null when nothing was earned', () => {
    expect(s.savingsRate).toBeCloseTo((2849.7 / 4200) * 100, 6);
    expect(summarize([tx('x', 'expense', 5, '2026-10-01')], today).savingsRate).toBeNull();
  });

  it('reports six months ending this month, oldest first', () => {
    expect(s.months.map((m) => m.key)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(s.months[5]).toMatchObject({ income: 4200, expense: 1350.3 });
    expect(s.months[4]).toMatchObject({ income: 4200, expense: 100 });
  });

  it('rolls over to the new month when "today" moves (a window left open past month end)', () => {
    const next = summarize(list, '2026-11-01');
    expect(next.monthIncome).toBe(0);
    expect(next.monthExpense).toBe(0);
    expect(next.balance).toBe(s.balance);
  });

  it('copes with no data at all', () => {
    const empty = summarize([], today);
    expect(empty).toMatchObject({ balance: 0, monthIncome: 0, monthExpense: 0, net: 0, savingsRate: null });
    expect(empty.months).toHaveLength(6);
  });
});

describe('weekSummary (Monday to Sunday)', () => {
  const monday = '2026-10-05';
  const list = [
    tx('mon', 'income', 200, '2026-10-05', 'Salary'),
    tx('sun', 'income', 200, '2026-10-11', 'Salary'), // last day of the week: included
    tx('nextMon', 'income', 999, '2026-10-12', 'Salary'), // first day of next week: excluded
    tx('prevSun', 'income', 999, '2026-10-04', 'Salary'), // excluded
    tx('e1', 'expense', 0.1, '2026-10-07'),
    tx('e2', 'expense', 0.2, '2026-10-08'),
  ];

  it('includes both edge days and nothing outside the week', () => {
    const w = weekSummary(list, monday);
    expect(w).toMatchObject({ weekStart: '2026-10-05', weekEnd: '2026-10-11', income: 400, expense: 0.3, net: 399.7, count: 4 });
  });

  it('works across the new year and for empty weeks', () => {
    const start = startOfWeek('2027-01-01');
    const w = weekSummary([tx('a', 'income', 50, '2026-12-31'), tx('b', 'income', 70, '2027-01-03'), tx('c', 'income', 1, '2027-01-04')], start);
    expect(w).toMatchObject({ weekStart: '2026-12-28', weekEnd: '2027-01-03', income: 120 });
    expect(weekSummary([], monday)).toMatchObject({ income: 0, expense: 0, net: 0, count: 0 });
  });
});
