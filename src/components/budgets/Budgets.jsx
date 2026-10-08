import { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useUndo } from '../../context/UndoContext';
import { EXPENSE_CATEGORIES } from '../../constants/categories';
import { CURRENCY } from '../../constants/currency';
import { currentMonthKey } from '../../utils/dates';
import { useToday } from '../../hooks/useToday';
import { formatMoney, formatPercent } from '../../utils/format';
import { parseMoney, toCents } from '../../utils/money';
import { spendingByCategory } from '../../utils/stats';
import CategoryBadge from '../ui/CategoryBadge';
import EmptyState from '../ui/EmptyState';
import { SkeletonCards } from '../ui/Skeleton';
import { useAccountLoading } from '../../context/SyncContext';
import Field from '../ui/Field';
import Icon from '../ui/Icon';
import MoneyInput from '../ui/MoneyInput';

const WARN_AT = 80;
const OVER_AT = 100;

// Bar colour shifts as spending approaches the cap.
function tone(pct) {
  if (pct >= OVER_AT) return { bar: 'bg-rose-500', text: 'text-rose-600', ring: 'ring-rose-200' };
  if (pct >= WARN_AT) return { bar: 'bg-orange-500', text: 'text-orange-600', ring: 'ring-orange-200' };
  if (pct >= 60) return { bar: 'bg-amber-400', text: 'text-amber-600', ring: 'ring-slate-200/70' };
  return { bar: 'bg-emerald-500', text: 'text-emerald-600', ring: 'ring-slate-200/70' };
}

export default function Budgets() {
  const loadingAccountData = useAccountLoading();
  const { transactions, budgets, setBudget, removeBudget, restoreBudget } = useApp();
  const { notify } = useUndo();
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState('');
  const [errors, setErrors] = useState({});

  const today = useToday(); // keeps "this month" correct in a long-lived window
  const spent = useMemo(() => {
    const map = {};
    spendingByCategory(transactions, currentMonthKey(today)).forEach((c) => {
      map[c.name] = c.amount;
    });
    return map;
  }, [transactions, today]);

  const rows = useMemo(
    () =>
      Object.entries(budgets)
        .map(([name, cap]) => {
          const used = spent[name] || 0;
          // Cent-exact remainder: avoids "-$0.00 over" from float error.
          return { name, cap, used, pct: (used / cap) * 100, left: (toCents(cap) - toCents(used)) / 100 };
        })
        .sort((a, b) => b.pct - a.pct),
    [budgets, spent]
  );

  const alerts = rows.filter((r) => r.pct >= WARN_AT);
  const unbudgeted = Object.entries(spent).filter(([name]) => !budgets[name]);

  const submit = (e) => {
    e.preventDefault();
    const found = {};
    const money = parseMoney(limit);
    if (!category) found.category = 'Choose a category.';
    if (money.error) found.limit = money.error;
    setErrors(found);
    if (Object.keys(found).length) return;
    setBudget(category, money.value);
    setCategory('');
    setLimit('');
  };

  const edit = (row) => {
    setCategory(row.name);
    setLimit(String(row.cap));
    setErrors({});
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr] 2xl:grid-cols-[400px_1fr]">
      <form onSubmit={submit} className="card space-y-4 lg:sticky lg:top-24 lg:self-start" noValidate>
        <h2 className="text-sm font-semibold text-slate-700">Set monthly budget</h2>
        <Field label="Category" htmlFor="b-category" error={errors.category}>
          <select
            id="b-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`input ${errors.category ? 'input-error' : ''}`}
          >
            <option value="">Select a category…</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
                {budgets[c.name] ? ' (update)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Monthly limit (${CURRENCY.symbol})`} htmlFor="b-limit" error={errors.limit}>
          <MoneyInput
            id="b-limit"
            placeholder="0.00"
            value={limit}
            onChange={setLimit}
            className={`input ${errors.limit ? 'input-error' : ''}`}
          />
        </Field>
        <button type="submit" className="btn btn-primary w-full">
          {budgets[category] ? 'Update budget' : 'Save budget'}
        </button>
        <p className="text-xs text-slate-500">
          Spending is totalled automatically from this month&apos;s expense transactions.
        </p>
      </form>

      <div className="min-w-0 space-y-4">
        {alerts.length > 0 && (
          <div className="space-y-2" role="status">
            {alerts.map((r) => (
              <div
                key={r.name}
                className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${
                  r.pct >= OVER_AT
                    ? 'bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                    : 'bg-orange-50 text-orange-800 ring-1 ring-orange-200'
                }`}
              >
                <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
                <span>
                  {r.pct >= OVER_AT ? (
                    <>
                      <strong>{r.name}</strong> is over budget by {formatMoney(-r.left)} (
                      {formatPercent(r.pct)} of {formatMoney(r.cap)}).
                    </>
                  ) : (
                    <>
                      <strong>{r.name}</strong> has reached {formatPercent(r.pct)} of its{' '}
                      {formatMoney(r.cap)} budget — {formatMoney(r.left)} left.
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {rows.length === 0 && loadingAccountData ? (
          <SkeletonCards label="Loading your budgets" />
        ) : rows.length === 0 ? (
          <div className="card">
            <EmptyState title="No budgets yet">
              Pick a category and a monthly limit to start tracking.
            </EmptyState>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((r) => {
              const t = tone(r.pct);
              return (
                <article key={r.name} className={`card ring-1 ${t.ring}`}>
                  <div className="flex items-start justify-between gap-2">
                    <CategoryBadge name={r.name} />
                    <div className="flex">
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => edit(r)}
                        aria-label={`Edit ${r.name} budget`}
                      >
                        <Icon name="pencil" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="btn-icon hover:!text-rose-600"
                        onClick={() => {
                          removeBudget(r.name);
                          notify({
                            message: 'Budget removed',
                            detail: `${r.name} \u00b7 ${formatMoney(r.cap)} a month`,
                            onUndo: () => restoreBudget(r.name, r.cap),
                          });
                        }}
                        aria-label={`Remove ${r.name} budget`}
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-2xl font-semibold tabular-nums">
                    {formatMoney(r.used)}
                    <span className="text-sm font-normal text-slate-500"> / {formatMoney(r.cap)}</span>
                  </p>
                  <div
                    className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, Math.round(r.pct))}
                    aria-label={`${r.name} budget used`}
                  >
                    <div
                      className={`h-full rounded-full transition-all ${t.bar}`}
                      style={{ width: `${Math.min(100, r.pct)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs">
                    <span className={`font-medium ${t.text}`}>{formatPercent(r.pct)} used</span>
                    <span className="text-slate-500">
                      {r.left >= 0 ? `${formatMoney(r.left)} left` : `${formatMoney(-r.left)} over`}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {unbudgeted.length > 0 && (
          <p className="text-xs text-slate-500">
            No budget set for:{' '}
            {unbudgeted.map(([name, amount]) => `${name} (${formatMoney(amount)})`).join(', ')}.
          </p>
        )}
      </div>
    </div>
  );
}
