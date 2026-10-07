import { useEffect, useState } from 'react';
import { CURRENCY } from '../../constants/currency';
import { CYCLES } from '../../constants/periods';
import { MAX_DATE, MIN_DATE, isValidISO, todayISO } from '../../utils/dates';
import { parseMoney } from '../../utils/money';
import Field from '../ui/Field';
import MoneyInput from '../ui/MoneyInput';

const blank = () => ({ name: '', cost: '', cycle: 'monthly', nextDue: todayISO() });

export default function SubscriptionForm({ editing, onSubmit, onCancel }) {
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setErrors({});
    setForm(editing ? { ...editing, cost: String(editing.cost) } : blank());
  }, [editing]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    const found = {};
    const money = parseMoney(form.cost);
    if (!form.name.trim()) found.name = 'Enter a provider or service name.';
    if (money.error) found.cost = money.error;
    if (!form.nextDue) found.nextDue = 'Pick the next due date.';
    else if (!isValidISO(form.nextDue)) found.nextDue = 'Enter a valid date.';
    setErrors(found);
    if (Object.keys(found).length) return;
    onSubmit({
      name: form.name.trim(),
      cost: money.value,
      cycle: form.cycle,
      nextDue: form.nextDue,
    });
    if (!editing) setForm(blank());
  };

  const cls = (f) => `input ${errors[f] ? 'input-error' : ''}`;

  return (
    <form onSubmit={submit} className="card space-y-4" noValidate>
      <h2 className="text-sm font-semibold text-slate-700">
        {editing ? 'Edit subscription' : 'New subscription'}
      </h2>
      <Field label="Provider" htmlFor="s-name" error={errors.name}>
        <input
          id="s-name"
          type="text"
          maxLength={60}
          placeholder="Netflix, Adobe, Gym…"
          value={form.name}
          onChange={set('name')}
          className={cls('name')}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Cost (${CURRENCY.symbol})`} htmlFor="s-cost" error={errors.cost}>
          <MoneyInput
            id="s-cost"
            placeholder="0.00"
            value={form.cost}
            onChange={(v) => setForm((f) => ({ ...f, cost: v }))}
            className={cls('cost')}
          />
        </Field>
        <Field label="Billing cycle" htmlFor="s-cycle">
          <select id="s-cycle" value={form.cycle} onChange={set('cycle')} className="input">
            {CYCLES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Next due date" htmlFor="s-due" error={errors.nextDue}>
        <input
          id="s-due"
          type="date"
          min={MIN_DATE}
          max={MAX_DATE}
          value={form.nextDue}
          onChange={set('nextDue')}
          className={cls('nextDue')}
        />
      </Field>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary flex-1">
          {editing ? 'Save changes' : 'Add subscription'}
        </button>
        {editing && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
