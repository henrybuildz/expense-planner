import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SubscriptionForm from '../../src/components/subscriptions/SubscriptionForm';
import TransactionForm from '../../src/components/transactions/TransactionForm';

const tx = (over = {}) => ({ id: 'a', type: 'expense', amount: 5, category: 'Food', date: '2026-10-08', notes: 'lunch', ...over });
const sub = (over = {}) => ({ id: 's1', name: 'Gym', cost: 9.5, cycle: 'monthly', nextDue: '2026-10-20', lastPaid: '', anchorDay: 20, ...over });
const noop = vi.fn();

describe('editing a record while a background sync hands over a fresh copy of it', () => {
  it('transaction form keeps what the user typed', async () => {
    const { rerender } = render(<TransactionForm editing={tx()} onSubmit={noop} onCancel={noop} />);
    const amount = screen.getByLabelText(/amount/i);
    await userEvent.clear(amount);
    await userEvent.type(amount, '42.50');
    // same record id, new object (e.g. another device changed the notes and the sync applied it)
    rerender(<TransactionForm editing={tx({ notes: 'changed elsewhere' })} onSubmit={noop} onCancel={noop} />);
    expect(screen.getByLabelText(/amount/i)).toHaveValue('42.50');
  });

  it('switching to a different record does load that record', () => {
    const { rerender } = render(<TransactionForm editing={tx()} onSubmit={noop} onCancel={noop} />);
    rerender(<TransactionForm editing={tx({ id: 'b', amount: 7 })} onSubmit={noop} onCancel={noop} />);
    expect(screen.getByLabelText(/amount/i)).toHaveValue('7.00');
  });

  it('leaving edit mode (or the record vanishing) empties the form', async () => {
    const { rerender } = render(<TransactionForm editing={tx()} onSubmit={noop} onCancel={noop} />);
    expect(screen.getByLabelText(/amount/i)).toHaveValue('5.00');
    rerender(<TransactionForm editing={null} onSubmit={noop} onCancel={noop} />);
    expect(screen.getByLabelText(/amount/i)).toHaveValue('');
  });

  it('subscription form keeps what the user typed', async () => {
    const { rerender } = render(<SubscriptionForm editing={sub()} onSubmit={noop} onCancel={noop} />);
    const name = screen.getByLabelText(/provider/i);
    await userEvent.clear(name);
    await userEvent.type(name, 'Gym Plus');
    rerender(<SubscriptionForm editing={sub({ cost: 11 })} onSubmit={noop} onCancel={noop} />);
    expect(screen.getByLabelText(/provider/i)).toHaveValue('Gym Plus');
  });

  it('saving an edit sends only what was changed, so untouched fields keep what another device did', async () => {
    const onSubmit = vi.fn();
    render(<TransactionForm editing={tx()} onSubmit={onSubmit} onCancel={noop} />);
    const amount = screen.getByLabelText(/amount/i);
    await userEvent.clear(amount);
    await userEvent.type(amount, '9.99');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit).toHaveBeenCalledWith({ amount: 9.99 }); // not notes / category / date / type
  });

  it('saving without changing anything sends nothing to change', async () => {
    const onSubmit = vi.fn();
    render(<SubscriptionForm editing={sub()} onSubmit={onSubmit} onCancel={noop} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it('adding still sends the whole record', async () => {
    const onSubmit = vi.fn();
    render(<SubscriptionForm editing={null} onSubmit={onSubmit} onCancel={noop} />);
    await userEvent.type(screen.getByLabelText(/provider/i), 'Spotify');
    await userEvent.type(screen.getByLabelText(/cost/i), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Add subscription' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Spotify', cost: 10, cycle: 'monthly' }));
  });
});
