import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { categoriesFor } from '../../constants/categories';
import { CURRENCY } from '../../constants/currency';
import { PERIODS, isCycle, periodById } from '../../constants/periods';
import { addCycle, todayISO } from '../../utils/dates';
import { formatMoney } from '../../utils/format';
import { parseMoney } from '../../utils/money';
import Field from '../ui/Field';
import TypeToggle from '../ui/TypeToggle';
import MoneyInput from '../ui/MoneyInput';

const MAX_PAYMENTS = 10000;

// (2.75, 'month') -> "2.8 months", (1, 'week') -> "1 week"
function span(n, unit) {
  const rounded = Number(n.toFixed(1));
  const text = rounded.toLocaleString(CURRENCY.locale, { maximumFractionDigits: 1 });
  return `${text} ${unit}${rounded === 1 ? '' : 's'}`;
}

const TARGETS = [
  { id: 'all', label: 'All periods' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly', label: 'Yearly' },
];

export default function Calculator() {
  const { addTransaction, addSubscription } = useApp();
  const [amount, setAmount] = useState('50');
  const [period, setPeriod] = useState('weekly');
  const [type, setType] = useState('expense');
  const [target, setTarget] = useState('all');
  const [payments, setPayments] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('');
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // Same rule as every other form: whole cents, at least 0.01. Rounding to cents up front
  // keeps what is shown consistent with the maths (33.333 used to display as 33.33 but multiply as
  // 33.333, so "33.33 x 3 = 100.00" appeared on screen).
  const parsed = amount === '' ? null : parseMoney(amount);
  const amountError = parsed ? parsed.error || '' : '';
  const valid = !!parsed && !parsed.error;
  const value = valid ? parsed.value : NaN;

  // Optional: "for N payments" turns a recurring amount into a total over time.
  const count = Number(payments);
  const paymentsError =
    payments === ''
      ? ''
      : !Number.isInteger(count) || count < 1
        ? 'Enter a whole number of payments, 1 or more.'
        : count > MAX_PAYMENTS
          ? `Keep it to ${MAX_PAYMENTS.toLocaleString()} payments or fewer.`
          : '';
  const hasPayments = valid && payments !== '' && !paymentsError;

  const from = periodById(period);
  const annual = valid ? value * from.perYear : 0;
  const rows = useMemo(
    () => (target === 'all' ? PERIODS : PERIODS.filter((p) => p.id === target)),
    [target]
  );

  const income = type === 'income';
  const accent = income ? 'text-emerald-600' : 'text-rose-600';
  const cycleOk = isCycle(period);

  const changeType = (next) => {
    setType(next);
    setCategory('');
    setSaveError('');
  };

  const saveTransaction = () => {
    if (!valid) return setSaveError(amountError || 'Enter an amount first.');
    if (!category) return setSaveError('Choose a category to save.');
    addTransaction({
      type,
      amount: value,
      category,
      date: todayISO(),
      notes: label.trim() || `${formatMoney(value)} ${from.label.toLowerCase()} (calculator)`,
    });
    setSaveError('');
    setNotice('Saved as a transaction dated today.');
  };

  const saveSubscription = () => {
    if (!valid) return setSaveError(amountError || 'Enter an amount first.');
    if (!label.trim()) return setSaveError('Add a label — it becomes the subscription name.');
    addSubscription({
      name: label.trim(),
      cost: value,
      cycle: period,
      nextDue: addCycle(todayISO(), period),
    });
    setSaveError('');
    setNotice('Saved as a subscription. Edit the due date on the Subscriptions tab.');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr] 2xl:grid-cols-[440px_1fr]">
      <section className="card space-y-4 lg:self-start" aria-label="Calculator inputs">
        <h2 className="text-sm font-semibold text-slate-700">Income / expense projector</h2>

        <TypeToggle value={type} onChange={changeType} name="calc-type" />

        <Field label={`Amount (${CURRENCY.symbol})`} htmlFor="c-amount" error={amountError}>
          <MoneyInput
            id="c-amount"
            placeholder="50"
            value={amount}
            onChange={setAmount}
            className={`input ${amountError ? 'input-error' : ''}`}
            aria-invalid={!!amountError}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Recurs" htmlFor="c-period">
            <select
              id="c-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="input"
            >
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Show" htmlFor="c-target">
            <select
              id="c-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="input"
            >
              {TARGETS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label={`For how many payments? (optional)`}
          htmlFor="c-payments"
          error={paymentsError}
        >
          <MoneyInput
            id="c-payments"
            integer
            placeholder="e.g. 12"
            value={payments}
            onChange={setPayments}
            className={`input ${paymentsError ? 'input-error' : ''}`}
            aria-invalid={!!paymentsError}
          />
        </Field>

        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-medium text-slate-700">Conversion factors (periods per year)</p>
          <p className="mt-1">
            {PERIODS.map((p) => `${p.label} ${p.perYear}`).join(' · ')}
          </p>
        </div>
      </section>

      <div className="min-w-0 space-y-6">
        <section className="card" aria-label="Projection results" aria-live="polite">
          <h2 className="text-sm font-semibold text-slate-700">Projection</h2>
          {!valid ? (
            <p className="mt-4 text-sm text-slate-500">
              Enter an amount to see the equivalent {income ? 'income' : 'expense'} over other periods.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-600">
                {formatMoney(value)} {from.label.toLowerCase()} {income ? 'income' : 'expense'}
                {' = '}
                <span className="font-medium">
                  {formatMoney(value)} × {from.perYear} = {formatMoney(annual)} per year
                </span>
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {rows.map((p) => {
                  const result = annual / p.perYear;
                  const same = p.id === period;
                  return (
                    <li
                      key={p.id}
                      className={`rounded-xl p-4 ring-1 ${
                        same ? 'bg-slate-50 ring-slate-200' : 'bg-white ring-slate-200'
                      }`}
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Per {p.noun}
                        {same && <span className="ml-1 normal-case">(entered)</span>}
                      </p>
                      <p className={`mt-1 text-xl font-semibold tabular-nums ${accent}`}>
                        {income ? '+' : '−'}
                        {formatMoney(result)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {same
                          ? 'Your input'
                          : `${formatMoney(value)} × ${from.perYear} ÷ ${p.perYear}`}
                      </p>
                    </li>
                  );
                })}
              </ul>
              {hasPayments && (
                <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Total over {count} {from.label.toLowerCase()} payment{count === 1 ? '' : 's'}
                  </p>
                  <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent}`}>
                    {income ? '+' : '−'}
                    {formatMoney(value * count)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatMoney(value)} × {count} payment{count === 1 ? '' : 's'} · covers about{' '}
                    {span((count * 12) / from.perYear, 'month')} (
                    {span((count * 52) / from.perYear, 'week')})
                  </p>
                </div>
              )}
              <p className="mt-4 text-xs text-slate-500">
                Formula: amount × (periods per year of the entered period) ÷ (periods per year of the
                target period). Results are rounded to cents for display only.
              </p>
            </>
          )}
        </section>

        <section className="card space-y-3" aria-label="Save shortcuts">
          <h2 className="text-sm font-semibold text-slate-700">Save this amount (optional)</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Label / name" htmlFor="c-label">
              <input
                id="c-label"
                type="text"
                maxLength={60}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Gym membership"
                className="input"
              />
            </Field>
            <Field label="Category (for transaction)" htmlFor="c-category">
              <select
                id="c-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input"
              >
                <option value="">Select a category…</option>
                {categoriesFor(type).map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={saveTransaction} disabled={!valid}>
              Save as transaction
            </button>
            {!income && cycleOk && (
              <button type="button" className="btn btn-secondary" onClick={saveSubscription} disabled={!valid}>
                Save as subscription
              </button>
            )}
          </div>
          {saveError && (
            <p className="field-error" role="alert">
              {saveError}
            </p>
          )}
          {notice && (
            <p className="text-sm text-emerald-700" role="status">
              {notice}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
