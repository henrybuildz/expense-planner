// Badge classes are written out in full so Tailwind's scanner picks them up.
export const EXPENSE_CATEGORIES = [
  { name: 'Food', color: '#f97316', badge: 'bg-orange-100 text-orange-700' },
  { name: 'Transport', color: '#0ea5e9', badge: 'bg-sky-100 text-sky-700' },
  { name: 'Bills', color: '#8b5cf6', badge: 'bg-violet-100 text-violet-700' },
  { name: 'Housing', color: '#6366f1', badge: 'bg-indigo-100 text-indigo-700' },
  { name: 'Entertainment', color: '#ec4899', badge: 'bg-pink-100 text-pink-700' },
  { name: 'Health', color: '#14b8a6', badge: 'bg-teal-100 text-teal-700' },
  { name: 'Shopping', color: '#eab308', badge: 'bg-yellow-100 text-yellow-700' },
  { name: 'Education', color: '#06b6d4', badge: 'bg-cyan-100 text-cyan-700' },
  { name: 'Subscriptions', color: '#a855f7', badge: 'bg-purple-100 text-purple-700' },
  { name: 'Other', color: '#64748b', badge: 'bg-slate-100 text-slate-700' },
];

export const INCOME_CATEGORIES = [
  { name: 'Salary', color: '#10b981', badge: 'bg-emerald-100 text-emerald-700' },
  { name: 'Freelance', color: '#22c55e', badge: 'bg-green-100 text-green-700' },
  { name: 'Investments', color: '#84cc16', badge: 'bg-lime-100 text-lime-700' },
  { name: 'Gift', color: '#34d399', badge: 'bg-emerald-50 text-emerald-600' },
  { name: 'Other Income', color: '#64748b', badge: 'bg-slate-100 text-slate-700' },
];

export const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

const FALLBACK = { name: 'Other', color: '#94a3b8', badge: 'bg-slate-100 text-slate-700' };

export function categoryMeta(name) {
  return ALL_CATEGORIES.find((c) => c.name === name) || { ...FALLBACK, name };
}

export function categoriesFor(type) {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}
