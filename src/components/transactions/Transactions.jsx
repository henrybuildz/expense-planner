import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ALL_CATEGORIES } from '../../constants/categories';
import { formatDate } from '../../utils/dates';
import { formatMoney } from '../../utils/format';
import { sumMoney } from '../../utils/money';
import CategoryBadge from '../ui/CategoryBadge';
import EmptyState from '../ui/EmptyState';
import Icon from '../ui/Icon';
import TransactionForm from './TransactionForm';

// Render in pages so thousands of records don't create thousands of DOM rows.
const PAGE_SIZE = 100;

export default function Transactions() {
  const { transactions, addTransaction, updateTransaction, deleteTransaction } = useApp();
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Start from the first page again whenever the filters change.
  useEffect(() => setLimit(PAGE_SIZE), [query, category, type]);

  const editing = transactions.find((t) => t.id === editingId) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions
      .filter((t) => {
        if (category && t.category !== category) return false;
        if (type && t.type !== type) return false;
        if (!q) return true;
        return (
          t.notes.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.date.includes(q) ||
          String(t.amount).includes(q)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, query, category, type]);

  const totals = useMemo(
    () => ({
      income: sumMoney(filtered.filter((t) => t.type === 'income').map((t) => t.amount)),
      expense: sumMoney(filtered.filter((t) => t.type === 'expense').map((t) => t.amount)),
    }),
    [filtered]
  );

  const handleSubmit = (data) => {
    if (editing) {
      updateTransaction(editing.id, data);
      setEditingId(null);
    } else {
      addTransaction(data);
    }
  };

  const handleDelete = (t) => {
    if (!window.confirm(`Delete this ${t.type} of ${formatMoney(t.amount)}?`)) return;
    if (editingId === t.id) setEditingId(null);
    deleteTransaction(t.id);
  };

  const filtersActive = query || category || type;

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <TransactionForm
          editing={editing}
          onSubmit={handleSubmit}
          onCancel={() => setEditingId(null)}
        />
      </div>

      <section className="card min-w-0" aria-label="Transaction history">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
              <Icon name="search" className="h-4 w-4" />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes, category, date…"
              aria-label="Search transactions"
              className="input pl-9"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
            className="input"
          >
            <option value="">All categories</option>
            {ALL_CATEGORIES.map((c) => (
              <option key={c.name + c.color} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Filter by type"
            className="input"
          >
            <option value="">Income &amp; expenses</option>
            <option value="income">Income only</option>
            <option value="expense">Expenses only</option>
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            {filtered.length} of {transactions.length} shown
          </span>
          <span className="tabular-nums">
            <span className="text-emerald-600">+{formatMoney(totals.income)}</span>
            {' · '}
            <span className="text-rose-600">−{formatMoney(totals.expense)}</span>
          </span>
        </div>

        <div className="mt-3 max-h-[65vh] overflow-y-auto pr-1">
          {transactions.length === 0 ? (
            <EmptyState title="No transactions yet">
              Use the form to add your first income or expense.
            </EmptyState>
          ) : filtered.length === 0 ? (
            <EmptyState title="No matches">
              {filtersActive && (
                <button
                  type="button"
                  className="font-medium text-emerald-700 hover:underline"
                  onClick={() => {
                    setQuery('');
                    setCategory('');
                    setType('');
                  }}
                >
                  Clear filters
                </button>
              )}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.slice(0, limit).map((t) => (
                <li
                  key={t.id}
                  className={`flex items-center gap-3 py-3 ${
                    t.id === editingId ? 'bg-emerald-50/60' : ''
                  }`}
                >
                  <span
                    className={`h-9 w-1 shrink-0 rounded-full ${
                      t.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CategoryBadge name={t.category} />
                      <span className="text-xs text-slate-500">{formatDate(t.date)}</span>
                    </div>
                    {t.notes && <p className="mt-1 truncate text-sm text-slate-600">{t.notes}</p>}
                  </div>
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {t.type === 'income' ? '+' : '−'}
                    {formatMoney(t.amount)}
                  </span>
                  <div className="flex shrink-0">
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => setEditingId(t.id)}
                      aria-label={`Edit ${t.category} transaction`}
                    >
                      <Icon name="pencil" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="btn-icon hover:!text-rose-600"
                      onClick={() => handleDelete(t)}
                      aria-label={`Delete ${t.category} transaction`}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {filtered.length > limit && (
            <button
              type="button"
              className="btn btn-secondary mt-3 w-full"
              onClick={() => setLimit((n) => n + PAGE_SIZE)}
            >
              Show more ({filtered.length - limit} remaining)
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
