export const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'transactions', label: 'Transactions', icon: 'transactions' },
  { id: 'budgets', label: 'Budgets', icon: 'budgets' },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'subscriptions' },
  { id: 'calculator', label: 'Calculator', icon: 'calculator' },
];

export const isTabId = (id) => TABS.some((t) => t.id === id);
