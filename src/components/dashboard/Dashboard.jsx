import { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useToday } from '../../hooks/useToday';
import { categoryMeta } from '../../constants/categories';
import { summarize } from '../../utils/stats';
import { formatDate } from '../../utils/dates';
import { formatMoney, formatPercent } from '../../utils/format';
import CategoryBadge from '../ui/CategoryBadge';
import EmptyState from '../ui/EmptyState';
import BackupNudge from '../backup/BackupNudge';
import { SkeletonDashboard } from '../ui/Skeleton';
import { useAccountLoading } from '../../context/SyncContext';
import DonutChart from './DonutChart';
import MonthlyBars from './MonthlyBars';
import WeekSummary from './WeekSummary';

// "-24691258% of this month's income" is unreadable; once spending is more than double the income say it as a multiple.
function savingsHint(rate) {
  if (rate === null) return 'No income recorded this month';
  if (rate < -100) {
    const times = 1 - rate / 100; // spent / earned
    return times >= 1000 ? "Spent over 1,000× this month's income" : `Spent ${times.toFixed(1)}× this month's income`;
  }
  return `${formatPercent(rate)} of this month's income`;
}

// `hero`: on a phone this card spans the whole row; the others sit three to a row and drop their hint line.
function Metric({ label, value, hint, tone, hero = false }) {
  const tones = {
    emerald: 'border-emerald-500 text-emerald-700',
    rose: 'border-rose-500 text-rose-600',
    slate: 'border-slate-400 text-slate-800',
  };
  const [border, text] = tones[tone].split(' ');
  // A phone shows three of these side by side (about 80px for the figure): size by length so an amount is never
  // split mid-number; only absurdly long ones may wrap. From sm up they use the full text-2xl.
  const size = hero
    ? 'text-2xl break-words'
    : value.length > 12
      ? 'text-xs break-words'
      : value.length > 9
        ? 'text-xs whitespace-nowrap'
        : 'text-sm whitespace-nowrap';
  return (
    <div className={`card border-l-4 max-sm:!p-2.5 ${border} ${hero ? 'col-span-3 sm:col-span-1' : ''}`}>
      <p className="break-words text-xs font-medium uppercase leading-tight tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold tabular-nums sm:mt-2 sm:whitespace-normal sm:text-2xl ${size} ${text}`}>
        {value}
      </p>
      <p className={`mt-1 text-xs text-slate-500 ${hero ? '' : 'max-sm:hidden'}`}>{hint}</p>
    </div>
  );
}

export default function Dashboard({ onNavigate }) {
  const loadingAccountData = useAccountLoading();
  const { transactions } = useApp();
  const today = useToday(); // re-aggregates when the month rolls over
  const stats = useMemo(() => summarize(transactions, today), [transactions, today]);
  const recent = useMemo(
    () => [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
    [transactions]
  );

  if (transactions.length === 0 && loadingAccountData) return <SkeletonDashboard label="Loading your overview" />;

  if (transactions.length === 0) {
    return (
      <div className="space-y-6">
      <BackupNudge />
      <div className="card">
        <EmptyState title="Welcome! Nothing here yet.">
          <p>Add your first transaction to see your financial overview.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-primary" onClick={() => onNavigate('transactions')}>
              Add a transaction
            </button>
          </div>
        </EmptyState>
      </div>
      </div>
    );
  }

  const monthTotal = stats.monthExpense;

  return (
    <div className="space-y-6">
      <BackupNudge />
      <section aria-label="Summary" className="grid grid-cols-3 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <Metric
          label="Balance"
          value={formatMoney(stats.balance)}
          hint="All time: income minus expenses"
          hero
          tone={stats.balance >= 0 ? 'slate' : 'rose'}
        />
        <Metric
          label="Income"
          value={formatMoney(stats.monthIncome)}
          hint="This month"
          tone="emerald"
        />
        <Metric
          label="Expenses"
          value={formatMoney(stats.monthExpense)}
          hint="This month"
          tone="rose"
        />
        <Metric
          label="Net savings"
          value={formatMoney(stats.net)}
          hint={savingsHint(stats.savingsRate)}
          tone={stats.net >= 0 ? 'emerald' : 'rose'}
        />
      </section>

      <WeekSummary transactions={transactions} today={today} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card" aria-labelledby="by-category">
          <h2 id="by-category" className="text-sm font-semibold text-slate-700">
            Spending by category <span className="font-normal text-slate-500">· this month</span>
          </h2>
          {stats.byCategory.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No expenses this month" />
            </div>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
              <DonutChart segments={stats.byCategory} total={monthTotal} />
              <ul className="w-full flex-1 space-y-3">
                {stats.byCategory.slice(0, 6).map((c) => (
                  <li key={c.name}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: categoryMeta(c.name).color }}
                        />
                        {c.name}
                      </span>
                      <span className="tabular-nums text-slate-600">
                        {formatMoney(c.amount)}{' '}
                        <span className="text-xs text-slate-500">{formatPercent(c.pct)}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${c.pct}%`,
                          backgroundColor: categoryMeta(c.name).color,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="trend">
          <h2 id="trend" className="text-sm font-semibold text-slate-700">
            Income vs. expenses <span className="font-normal text-slate-500">· last 6 months</span>
          </h2>
          <div className="mt-4">
            <MonthlyBars months={stats.months} />
          </div>
        </section>
      </div>

      <section className="card" aria-labelledby="recent">
        <div className="flex items-center justify-between">
          <h2 id="recent" className="text-sm font-semibold text-slate-700">
            Recent transactions
          </h2>
          <button
            type="button"
            className="text-sm font-medium text-emerald-700 hover:underline"
            onClick={() => onNavigate('transactions')}
          >
            View all
          </button>
        </div>
        <ul className="mt-3 divide-y divide-slate-100">
          {recent.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t.notes || t.category}</p>
                <p className="text-xs text-slate-500">{formatDate(t.date)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <CategoryBadge name={t.category} />
                <span
                  className={`min-w-24 whitespace-nowrap text-right text-sm font-semibold tabular-nums ${
                    t.type === 'income' ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {t.type === 'income' ? '+' : '−'}
                  {formatMoney(t.amount)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
