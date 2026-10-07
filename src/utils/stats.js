import { currentMonthKey, lastMonthKeys, monthKey, monthLabel, todayISO } from './dates';
import { sumMoney, toCents } from './money';

const total = (list) => sumMoney(list.map((t) => t.amount));

// Expense totals per category for one month, largest first (cent-exact).
export function spendingByCategory(transactions, month = currentMonthKey()) {
  const cents = new Map();
  transactions.forEach((t) => {
    if (t.type === 'expense' && monthKey(t.date) === month) {
      cents.set(t.category, (cents.get(t.category) || 0) + toCents(t.amount));
    }
  });
  const grand = [...cents.values()].reduce((a, b) => a + b, 0);
  return [...cents.entries()]
    .map(([name, c]) => ({ name, amount: c / 100, pct: grand ? (c / grand) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export function summarize(transactions, today = todayISO()) {
  const month = currentMonthKey(today);
  const income = transactions.filter((t) => t.type === 'income');
  const expenses = transactions.filter((t) => t.type === 'expense');
  const inMonth = (key) => (t) => monthKey(t.date) === key;
  const monthIncome = total(income.filter(inMonth(month)));
  const monthExpense = total(expenses.filter(inMonth(month)));
  const net = (toCents(monthIncome) - toCents(monthExpense)) / 100;
  return {
    balance: (toCents(total(income)) - toCents(total(expenses))) / 100,
    monthIncome,
    monthExpense,
    net,
    savingsRate: monthIncome > 0 ? (net / monthIncome) * 100 : null,
    byCategory: spendingByCategory(transactions, month),
    months: lastMonthKeys(6, today).map((key) => ({
      key,
      label: monthLabel(key),
      income: total(income.filter(inMonth(key))),
      expense: total(expenses.filter(inMonth(key))),
    })),
  };
}
