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
    expect(await screen.findByText(/amount greater than 0/i)).toBeInTheDocument();
    expect(screen.getByText(/choose a category/i)).toBeInTheDocument();
    expect(stored('transactions')).toEqual([]);
  });

  it('a delete shows the undo bar and Undo brings the record back', async () => {
    localStorage.setItem('expense-planner:transactions', JSON.stringify([tx('a', { notes: 'lunch' })]));
    render(<App />);
    await openTab('Transactions');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Food transaction' }));
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
