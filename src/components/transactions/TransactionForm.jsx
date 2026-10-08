import { useEffect, useState } from 'react';
import { categoriesFor } from '../../constants/categories';
import { CURRENCY } from '../../constants/currency';
import { isValidISO, todayISO } from '../../utils/dates';
import { parseMoney } from '../../utils/money';
import DateInput from '../ui/DateInput';
import Field from '../ui/Field';
import TypeToggle from '../ui/TypeToggle';
import MoneyInput from '../ui/MoneyInput';

const blank = () => ({ type: 'expense', amount: '', category: '', date: todayISO(), notes: '' });

function validate(form) {
  const errors = {};
  const money = parseMoney(form.amount);
  if (money.error) errors.amount = money.error;
  if (!form.category) errors.category = 'Choose a category.';
  if (!form.date || !isValidISO(form.date)) errors.date = 'Enter a real date as DD/MM/YYYY.';
  return errors;
}

export default function TransactionForm({ editing, onSubmit, onCancel }) {
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});

  // Load the transaction being edited (or reset when editing stops).
  useEffect(() => {
    setErrors({});
    setForm(editing ? { ...editing, amount: String(editing.amount) } : blank());
  }, [editing]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const setType = (type) =>
    setForm((f) => ({
      ...f,
      type,
      category: categoriesFor(type).some((c) => c.name === f.category) ? f.category : '',
    }));

  const submit = (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    onSubmit({
      type: form.type,
      amount: parseMoney(form.amount).value,
      category: form.category,
      date: form.date,
      notes: form.notes.trim(),
    });
    if (!editing) setForm((f) => ({ ...blank(), type: f.type, date: f.date }));
  };

  const invalid = (field) => (errors[field] ? 'input-error' : '');

  return (
    <form onSubmit={submit} className="card space-y-4" noValidate>
      <h2 className="text-sm font-semibold text-slate-700">
        {editing ? 'Edit transaction' : 'New transaction'}
      </h2>

      <TypeToggle value={form.type} onChange={setType} />

      <Field label={`Amount (${CURRENCY.symbol})`} htmlFor="tx-amount" error={errors.amount}>
        <MoneyInput
          id="tx-amount"
          placeholder="0.00"
          value={form.amount}
          onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
          className={`input ${invalid('amount')}`}
          aria-invalid={!!errors.amount}
        />
      </Field>

      <Field label="Category" htmlFor="tx-category" error={errors.category}>
        <select
          id="tx-category"
          value={form.category}
          onChange={set('category')}
          className={`input ${invalid('category')}`}
          aria-invalid={!!errors.category}
        >
          <option value="">Select a category…</option>
          {categoriesFor(form.type).map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Date" htmlFor="tx-date" error={errors.date}>
        <DateInput
          id="tx-date"
          value={form.date}
          onChange={(date) => setForm((f) => ({ ...f, date }))}
          className={`input ${invalid('date')}`}
          aria-invalid={!!errors.date}
        />
      </Field>

      <Field label="Notes (optional)" htmlFor="tx-notes">
        <textarea
          id="tx-notes"
          rows={2}
          maxLength={200}
          value={form.notes}
          onChange={set('notes')}
          className="input resize-none"
          placeholder="What was this for?"
        />
      </Field>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary flex-1">
          {editing ? 'Save changes' : 'Add transaction'}
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
