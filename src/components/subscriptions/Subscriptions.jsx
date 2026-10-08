import { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { convert, periodById, toAnnual } from '../../constants/periods';
import { daysUntil, formatDate } from '../../utils/dates';
import { useToday } from '../../hooks/useToday';
import { formatMoney } from '../../utils/format';
import { sumMoney } from '../../utils/money';
import EmptyState from '../ui/EmptyState';
import Icon from '../ui/Icon';
import SubscriptionForm from './SubscriptionForm';

const SOON_DAYS = 7;

function dueInfo(nextDue, today) {
  const d = daysUntil(nextDue, today);
  if (d < 0) {
    return { text: `Overdue by ${-d} day${d === -1 ? '' : 's'}`, cls: 'bg-rose-100 text-rose-700' };
  }
  if (d === 0) return { text: 'Due today', cls: 'bg-amber-100 text-amber-800' };
  if (d <= SOON_DAYS) {
    return { text: `Due in ${d} day${d === 1 ? '' : 's'}`, cls: 'bg-amber-100 text-amber-800' };
  }
  return { text: `Due ${formatDate(nextDue)}`, cls: 'bg-slate-100 text-slate-600' };
}

export default function Subscriptions() {
  const {
    subscriptions,
    addSubscription,
    updateSubscription,
    deleteSubscription,
    markSubscriptionPaid,
  } = useApp();
  const [editingId, setEditingId] = useState(null);
  const today = useToday(); // due badges stay correct across midnight
  const editing = subscriptions.find((s) => s.id === editingId) || null;

  const sorted = useMemo(
    () => [...subscriptions].sort((a, b) => a.nextDue.localeCompare(b.nextDue)),
    [subscriptions]
  );

  const totals = useMemo(() => {
    const annual = subscriptions.reduce((acc, s) => acc + toAnnual(s.cost, s.cycle), 0);
    const soon = subscriptions.filter((s) => daysUntil(s.nextDue, today) <= SOON_DAYS);
    return {
      annual,
      monthly: annual / 12,
      soonCount: soon.length,
      soonAmount: sumMoney(soon.map((s) => s.cost)),
    };
  }, [subscriptions, today]);

  const handleSubmit = (data) => {
    if (editing) {
      updateSubscription(editing.id, data);
      setEditingId(null);
    } else {
      addSubscription(data);
    }
  };

  return (
    <div className="space-y-6">
      <section aria-label="Recurring cost summary" className="grid gap-4 sm:grid-cols-3">
        <div className="card border-l-4 border-rose-500">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Monthly overhead</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-rose-600">
            {formatMoney(totals.monthly)}
          </p>
        </div>
        <div className="card border-l-4 border-rose-500">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Annual overhead</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-rose-600">
            {formatMoney(totals.annual)}
          </p>
        </div>
        <div className="card border-l-4 border-amber-400">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Due or overdue (7 days)</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {totals.soonCount}
            <span className="ml-2 text-sm font-normal text-slate-500">
              {formatMoney(totals.soonAmount)}
            </span>
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr] 2xl:grid-cols-[400px_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <SubscriptionForm
            editing={editing}
            onSubmit={handleSubmit}
            onCancel={() => setEditingId(null)}
          />
        </div>

        <section className="card min-w-0" aria-label="Subscriptions">
          {sorted.length === 0 ? (
            <EmptyState title="No subscriptions yet">
              Add streaming, software or any recurring bill to see your fixed costs.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sorted.map((s) => {
                const due = dueInfo(s.nextDue, today);
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="text-xs text-slate-500">
                        {periodById(s.cycle).label} · {formatMoney(convert(s.cost, s.cycle, 'monthly'))}
                        /mo
                        {s.lastPaid && ` · last paid ${formatDate(s.lastPaid)}`}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${due.cls}`}>
                      {due.text}
                    </span>
                    <span className="w-20 text-right text-sm font-semibold tabular-nums text-rose-600">
                      {formatMoney(s.cost)}
                    </span>
                    <div className="flex items-center">
                      <button
                        type="button"
                        className="btn btn-secondary !px-2.5 !py-1 text-xs"
                        onClick={() => markSubscriptionPaid(s.id)}
                        title="Record a payment and move the due date forward one cycle"
                      >
                        <Icon name="check" className="h-3.5 w-3.5" /> Mark paid
                      </button>
                      <button
                        type="button"
                        className="btn-icon ml-1"
                        onClick={() => setEditingId(s.id)}
                        aria-label={`Edit ${s.name}`}
                      >
                        <Icon name="pencil" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="btn-icon hover:!text-rose-600"
                        onClick={() => {
                          if (!window.confirm(`Delete ${s.name}?`)) return;
                          if (editingId === s.id) setEditingId(null);
                          deleteSubscription(s.id);
                        }}
                        aria-label={`Delete ${s.name}`}
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
