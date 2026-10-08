import { useMemo, useState } from 'react';
import { MIN_DATE, addDays, formatDate, startOfWeek } from '../../utils/dates';
import { formatMoney } from '../../utils/format';
import { weekSummary } from '../../utils/stats';

function Figure({ label, value, tone }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 break-words text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

// Weekly (Monday-Sunday) income / expenses with previous / next week navigation.
export default function WeekSummary({ transactions, today }) {
  // The week the user picked, as its Monday ('YYYY-MM-DD'); null means "follow the current week".
  // Storing the real date (not "N weeks ago") keeps the card on the same week if the clock
  // rolls past midnight while the app is open.
  const [picked, setPicked] = useState(null);
  const currentStart = startOfWeek(today);
  const start = picked ?? currentStart;
  const week = useMemo(() => weekSummary(transactions, start), [transactions, start]);

  const goTo = (monday) => setPicked(monday >= currentStart ? null : monday); // never into the future
  const isCurrent = start >= currentStart;
  const canGoBack = addDays(start, -7) >= MIN_DATE; // stay inside the supported date range
  const title = isCurrent ? 'This week' : start === addDays(currentStart, -7) ? 'Last week' : 'Week';

  return (
    <section className="card" aria-labelledby="week-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="week-title" className="text-sm font-semibold text-slate-700">
            {title}
          </h2>
          <p className="text-xs text-slate-500">
            {formatDate(week.weekStart)} – {formatDate(week.weekEnd)} · Monday to Sunday
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn btn-secondary !px-3 !py-1.5"
            onClick={() => goTo(addDays(start, -7))}
            disabled={!canGoBack}
            aria-label="Previous week"
          >
            ‹
          </button>
          {!isCurrent && (
            <button
              type="button"
              className="btn btn-secondary !px-3 !py-1.5"
              onClick={() => setPicked(null)}
            >
              This week
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary !px-3 !py-1.5"
            onClick={() => goTo(addDays(start, 7))}
            disabled={isCurrent}
            aria-label="Next week"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <Figure label="Income" value={formatMoney(week.income)} tone="text-emerald-700" />
        <Figure label="Expenses" value={formatMoney(week.expense)} tone="text-rose-600" />
        <Figure
          label="Net"
          value={formatMoney(week.net)}
          tone={week.net >= 0 ? 'text-emerald-700' : 'text-rose-600'}
        />
      </div>
      {week.count === 0 && (
        <p className="mt-3 text-xs text-slate-500">No transactions in this week.</p>
      )}
    </section>
  );
}
