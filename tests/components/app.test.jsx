import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';

const tx = (id, o = {}) => ({ id, type: 'expense', amount: 5, category: 'Food', date: '2026-10-08', notes: '', ...o });
const stored = (k) => JSON.parse(localStorage.getItem(`expense-planner:${k}`));

beforeEach(() => {
  window.confirm = vi.fn(() => true);
});

const openTab = (name) => userEvent.click(screen.getByRole('tab', { name: new RegExp(name, 'i') }));

describe('App (smoke test through the real screens)', () => {
  it('starts on the dashboard with no data and without crashing', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /pocket book/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('every tab renders without hitting the crash screen', async () => {
    localStorage.setItem('expense-planner:transactions', JSON.stringify([tx('a'), tx('b', { type: 'income', category: 'Salary', amount: 900 })]));
    localStorage.setItem('expense-planner:budgets', JSON.stringify({ Food: 100 }));
    render(<App />);
    for (const name of ['Transactions', 'Budgets', 'Subscriptions', 'Calculator', 'Dashboard']) {
      await openTab(name);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
  });

  // The original "I can't type in the amount box" bug, end to end.
  it('adds a transaction by typing into the form and saves it', async () => {
    render(<App />);
    await openTab('Transactions');
    await userEvent.type(screen.getByLabelText(/amount/i), '1234.56');
    expect(screen.getByLabelText(/amount/i)).toHaveValue('1234.56');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Food');
    await userEvent.type(screen.getByLabelText(/notes/i), 'groceries');
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    const saved = stored('transactions');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ amount: 1234.56, notes: 'groceries' });
  });

  it('accepts a comma decimal typed into the form (12,5 is 12.50)', async () => {
    render(<App />);
    await openTab('Transactions');
    await userEvent.type(screen.getByLabelText(/amount/i), '12,5');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Food');
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(stored('transactions')[0].amount).toBe(12.5);
  });

  it('refuses a zero amount and a missing category, and saves nothing', async () => {
    render(<App />);
    await openTab('Transactions');
    await userEvent.type(screen.getByLabelText(/amount/i), '0.004'); // the box stops at two decimals: 0.00
    expect(screen.getByLabelText(/amount/i)).toHaveValue('0.00');
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    // "0.00" is not "greater than 0" in any useful sense: the message must name the real minimum (EUR 0.01).
    expect(await screen.findByText(/smallest amount is/i)).toBeInTheDocument();
    expect(screen.getByText(/choose a category/i)).toBeInTheDocument();
    expect(stored('transactions')).toEqual([]);
  });

  it('an amount error disappears as soon as the amount is corrected', async () => {
    render(<App />);
    await openTab('Transactions');
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(await screen.findByText(/amount greater than 0/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/amount/i), '5');
    expect(screen.queryByText(/amount greater than 0/i)).not.toBeInTheDocument();
    expect(screen.getByText(/choose a category/i)).toBeInTheDocument(); // untouched fields keep their error
  });

  it('opening Edit moves focus into the form', async () => {
    localStorage.setItem('expense-planner:transactions', JSON.stringify([tx('a', { notes: 'lunch' })]));
    render(<App />);
    await openTab('Transactions');
    await userEvent.click(screen.getByRole('button', { name: /^Edit Food transaction/ }));
    expect(screen.getByLabelText(/amount/i)).toHaveFocus();
  });

  it('delete and edit buttons tell identical-category rows apart', async () => {
    localStorage.setItem(
      'expense-planner:transactions',
      JSON.stringify([tx('a', { amount: 5 }), tx('b', { amount: 7 })])
    );
    render(<App />);
    await openTab('Transactions');
    expect(screen.getByRole('button', { name: /^Delete Food transaction, €5\.00/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Delete Food transaction, €7\.00/ })).toBeInTheDocument();
  });

  it('Mark paid records an expense on the Dashboard totals and Undo takes it back', async () => {
    const due = new Date();
    const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    localStorage.setItem(
      'expense-planner:subscriptions',
      JSON.stringify([{ id: 's1', name: 'Gym', cost: 9.5, cycle: 'weekly', nextDue: iso, lastPaid: '', anchorDay: 1 }])
    );
    render(<App />);
    await openTab('Subscriptions');
    await userEvent.click(screen.getByRole('button', { name: /mark paid/i }));
    expect(stored('transactions')).toHaveLength(1);
    expect(stored('transactions')[0]).toMatchObject({ category: 'Subscriptions', amount: 9.5, notes: 'Gym' });
    await userEvent.click(screen.getByRole('button', { name: /^undo/i }));
    expect(stored('transactions')).toEqual([]);
  });

  it('the skip link moves focus to the content without touching the address', async () => {
    render(<App />);
    const before = window.location.href;
    await userEvent.click(screen.getByRole('link', { name: /skip to content/i }));
    expect(document.getElementById('panel')).toHaveFocus();
    expect(window.location.href).toBe(before);
  });

  it('renaming a subscription does not re-anchor a month-end bill to a short month\'s day', async () => {
    // A Jan-31 bill that is currently due on Feb 28: the anchor must stay 31 so March lands on the 31st.
    localStorage.setItem(
      'expense-planner:subscriptions',
      JSON.stringify([{ id: 's1', name: 'Rent', cost: 100, cycle: 'monthly', nextDue: '2027-02-28', lastPaid: '', anchorDay: 31 }])
    );
    render(<App />);
    await openTab('Subscriptions');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Rent' }));
    const name = screen.getByLabelText(/provider/i);
    await userEvent.clear(name);
    await userEvent.type(name, 'Rent flat');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const saved = JSON.parse(localStorage.getItem('expense-planner:subscriptions'))[0];
    expect(saved).toMatchObject({ name: 'Rent flat', nextDue: '2027-02-28', anchorDay: 31 });
  });

  it('the page title follows the screen', async () => {
    render(<App />);
    expect(document.title).toBe('Dashboard · Pocket Book');
    await openTab('Budgets');
    expect(document.title).toBe('Budgets · Pocket Book');
  });

  it('the calculator starts empty instead of with made-up data', async () => {
    render(<App />);
    await openTab('Calculator');
    expect(screen.getByLabelText(/amount/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save as transaction' })).toBeDisabled();
  });

  it('a delete shows the undo bar and Undo brings the record back', async () => {
    localStorage.setItem('expense-planner:transactions', JSON.stringify([tx('a', { notes: 'lunch' })]));
    render(<App />);
    await openTab('Transactions');
    await userEvent.click(screen.getByRole('button', { name: /^Delete Food transaction/ }));
    expect(stored('transactions')).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(stored('transactions')).toHaveLength(1);
    expect(stored('transactions')[0].notes).toBe('lunch');
  });

  it('survives corrupt stored data: starts empty and keeps the raw text', () => {
    localStorage.setItem('expense-planner:transactions', '{{broken');
    render(<App />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(localStorage.getItem('expense-planner:transactions:corrupt-backup')).toBe('{{broken');
  });
});

describe('which screen the app opens on', () => {
  const selected = () => screen.getByRole('tab', { selected: true }).textContent;

  it('a fresh launch starts on the Dashboard', () => {
    render(<App />);
    expect(selected()).toMatch(/dashboard/i);
  });

  it('a refresh in the same window keeps the tab you were on', async () => {
    const first = render(<App />);
    await openTab('Budgets');
    first.unmount(); // same window: sessionStorage survives
    render(<App />);
    expect(selected()).toMatch(/budgets/i);
  });

  it('closing and reopening (session storage gone) starts on the Dashboard again', async () => {
    const first = render(<App />);
    await openTab('Subscriptions');
    first.unmount();
    sessionStorage.clear(); // what closing the tab / app does
    render(<App />);
    expect(selected()).toMatch(/dashboard/i);
  });

  it('a tab remembered by an older version (localStorage) is ignored and cleaned up', () => {
    localStorage.setItem('expense-planner:tab', '"budgets"');
    render(<App />);
    expect(selected()).toMatch(/dashboard/i);
    expect(localStorage.getItem('expense-planner:tab')).toBeNull();
  });

  it('a garbage remembered value falls back to the Dashboard', () => {
    sessionStorage.setItem('expense-planner:tab', '"nonsense"');
    render(<App />);
    expect(selected()).toMatch(/dashboard/i);
  });

  it('blocked storage still works: starts on the Dashboard and tabs switch', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    render(<App />);
    expect(selected()).toMatch(/dashboard/i);
    await openTab('Calculator');
    expect(selected()).toMatch(/calculator/i);
  });
});

describe('storage that throws on access (some private modes)', () => {
  it('touching window.sessionStorage itself throws: the app still starts on the Dashboard and tabs work', async () => {
    const real = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('denied', 'SecurityError'); } });
    try {
      render(<App />);
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(/dashboard/i);
      await openTab('Budgets');
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(/budgets/i);
    } finally {
      Object.defineProperty(window, 'sessionStorage', real);
    }
  });
});
