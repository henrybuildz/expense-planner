import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../../src/context/AppContext';
import Budgets from '../../src/components/budgets/Budgets';
import Dashboard from '../../src/components/dashboard/Dashboard';
import Subscriptions from '../../src/components/subscriptions/Subscriptions';
import Transactions from '../../src/components/transactions/Transactions';
import { UndoProvider } from '../../src/context/UndoContext';

// ---- part 1: each screen, with the sync context faked so we control `loadingAccountData`
let loading = false;
vi.mock('../../src/context/SyncContext', async (orig) => ({
  ...(await orig()),
  useAccountLoading: () => loading,
}));

const tx = { id: 'a', type: 'expense', amount: 5, category: 'Food', date: '2026-10-08', notes: 'lunch' };
const wrap = (ui) => render(<AppProvider><UndoProvider>{ui}</UndoProvider></AppProvider>);
const screens = [
  ['Dashboard', <Dashboard onNavigate={() => {}} />, /loading your overview/i, /nothing here yet/i],
  ['Transactions', <Transactions />, /loading your transactions/i, /no transactions yet/i],
  ['Budgets', <Budgets />, /loading your budgets/i, /no budgets yet/i],
  ['Subscriptions', <Subscriptions />, /loading your subscriptions/i, /no subscriptions yet/i],
];

describe.each(screens)('%s while the first sync is pending', (_name, ui, loadingText, emptyText) => {
  it('shows placeholders instead of the "nothing here yet" message', () => {
    loading = true;
    wrap(ui);
    const status = screen.getByRole('status', { name: '' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(loadingText)).toBeInTheDocument();
    expect(screen.queryByText(emptyText)).not.toBeInTheDocument();
  });

  it('shows the normal empty message once loading is over', () => {
    loading = false;
    wrap(ui);
    expect(screen.getByText(emptyText)).toBeInTheDocument();
    expect(screen.queryByRole('status', { busy: true })).not.toBeInTheDocument();
  });
});

describe('placeholders never hide real data', () => {
  it('a device that already has transactions keeps showing them while syncing', () => {
    loading = true;
    localStorage.setItem('expense-planner:transactions', JSON.stringify([tx]));
    wrap(<Transactions />);
    expect(screen.getByText('lunch')).toBeInTheDocument();
    expect(screen.queryByText(/loading your transactions/i)).not.toBeInTheDocument();
  });

  it('same for the dashboard', () => {
    loading = true;
    localStorage.setItem('expense-planner:transactions', JSON.stringify([tx]));
    wrap(<Dashboard onNavigate={() => {}} />);
    expect(screen.queryByText(/loading your overview/i)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /summary/i })).toBeInTheDocument();
  });

  it('the decorative shapes are hidden from screen readers', () => {
    loading = true;
    const { container } = wrap(<Transactions />);
    container.querySelectorAll('.skeleton').forEach((el) => expect(el).toHaveAttribute('aria-hidden', 'true'));
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(3);
  });
});

describe('no false zeros while loading', () => {
  it('Transactions hides "0 of 0 shown" and the +€0.00 / −€0.00 totals', () => {
    loading = true;
    wrap(<Transactions />);
    expect(screen.queryByText(/of 0 shown/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/€0\.00/)).not.toBeInTheDocument();
  });

  it('Transactions shows them normally once loading is over', () => {
    loading = false;
    wrap(<Transactions />);
    expect(screen.getByText(/0 of 0 shown/i)).toBeInTheDocument();
  });

  it('Subscriptions hides the three €0.00 summary cards while loading', () => {
    loading = true;
    wrap(<Subscriptions />);
    expect(screen.queryByText(/€0\.00/)).not.toBeInTheDocument();
    expect(screen.getByText('Monthly overhead')).toBeInTheDocument(); // the labels stay
  });

  it('Subscriptions shows the zero totals once loading is over', () => {
    loading = false;
    wrap(<Subscriptions />);
    expect(screen.getAllByText('€0.00').length).toBeGreaterThanOrEqual(2);
  });
});

describe('totals stay visible for existing data', () => {
  it('a device with subscriptions keeps its totals while a sync runs', () => {
    loading = true;
    localStorage.setItem('expense-planner:subscriptions', JSON.stringify([
      { id: 's', name: 'Netflix', cost: 10, cycle: 'monthly', nextDue: '2026-10-20', lastPaid: '', anchorDay: 20 },
    ]));
    wrap(<Subscriptions />);
    expect(screen.getAllByText('€10.00').length).toBeGreaterThan(0);
    expect(screen.getByText('€120.00')).toBeInTheDocument(); // annual overhead
  });

  it('a device with transactions keeps its totals line while a sync runs', () => {
    loading = true;
    localStorage.setItem('expense-planner:transactions', JSON.stringify([tx]));
    wrap(<Transactions />);
    expect(screen.getByText(/1 of 1 shown/i)).toBeInTheDocument();
  });
});
