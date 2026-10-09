import { useEffect, useRef, useState } from 'react';
import { CURRENCY } from '../../constants/currency';
import { CYCLES } from '../../constants/periods';
import { isValidISO, todayISO } from '../../utils/dates';
import { changedFields } from '../../utils/changes';
import { parseMoney } from '../../utils/money';
import DateInput from '../ui/DateInput';
import Field from '../ui/Field';
import MoneyInput from '../ui/MoneyInput';

const blank = () => ({ name: '', cost: '', cycle: 'monthly', nextDue: todayISO() });

export default function SubscriptionForm({ editing, onSubmit, onCancel }) {
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const baseline = useRef(null); // the saved values this edit started from

  // Keyed on the record's id, not the object, so a background sync that hands over a fresh copy of the same
  // record does not wipe what the user is typing (see TransactionForm).
  const editingId = editing ? editing.id : null;
  useEffect(() => {
    setErrors({});
    setForm(editing ? { ...editing, cost: editing.cost.toFixed(2) } : blank());
    baseline.current = editing
      ? { name: editing.name, cost: editing.cost, cycle: editing.cycle, nextDue: editing.nextDue }
      : null;
  }, [editingId]);

  // Move focus into the form when a different record starts being edited (not on every re-render of the same one).
  useEffect(() => {
    if (editingId) document.getElementById('s-name')?.focus();
  }, [editingId]);

  // Editing a field drops its own error at once, so a red message never lingers over a value that is now fine.
  const clearError = (field) => setErrors((er) => (er[field] ? { ...er, [field]: undefined } : er));
  const set = (field) => (e) => {
    clearError(field);
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  const submit = (e) => {
    e.preventDefault();
    const found = {};
    const money = parseMoney(form.cost);
    if (!form.name.trim()) found.name = 'Enter a provider or service name.';
    if (money.error) found.cost = money.error;
    if (!form.nextDue || !isValidISO(form.nextDue)) found.nextDue = 'Enter a real due date as DD/MM/YYYY.';
    setErrors(found);
    if (Object.keys(found).length) return;
    const data = { name: form.name.trim(), cost: money.value, cycle: form.cycle, nextDue: form.nextDue };
    onSubmit(editing && baseline.current ? changedFields(data, baseline.current) : data);
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
            onChange={(v) => {
              clearError('cost');
              setForm((f) => ({ ...f, cost: v }));
            }}
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
        <DateInput
          id="s-due"
          value={form.nextDue}
          onChange={(nextDue) => setForm((f) => ({ ...f, nextDue }))}
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
