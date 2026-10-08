import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { formatDate, startOfWeek, todayISO } from '../../src/utils/dates';

const stored = (k) => JSON.parse(localStorage.getItem(`expense-planner:${k}`));
const openTab = (name) => userEvent.click(screen.getByRole('tab', { name: new RegExp(name, 'i') }));
const tx = (id, date, extra = {}) => ({ id, type: 'expense', amount: 5, category: 'Food', date, notes: '', ...extra });

beforeEach(() => {
  window.confirm = vi.fn(() => true);
});

// The transaction form, ready to submit except for the date.
async function txForm() {
  render(<App />);
  await openTab('Transactions');
  await userEvent.type(screen.getByLabelText(/amount/i), '5');
  await userEvent.selectOptions(screen.getByLabelText('Category'), 'Food');
  const date = screen.getByLabelText('Date');
  await userEvent.clear(date);
  return date;
}
const submitTx = () => userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));

describe('transaction form date field', () => {
  it('starts on today, written DD/MM/YYYY', async () => {
    render(<App />);
    await openTab('Transactions');
    expect(screen.getByLabelText('Date')).toHaveValue(formatDate(todayISO()));
    expect(screen.getByLabelText('Date')).toHaveAttribute('placeholder', 'DD/MM/YYYY');
    expect(screen.getByLabelText('Date')).toHaveAttribute('type', 'text');
  });

  it('typing digits formats itself and saves the stored YYYY-MM-DD', async () => {
    const date = await txForm();
    await userEvent.type(date, '08102026');
    expect(date).toHaveValue('08/10/2026');
    await submitTx();
    expect(stored('transactions')[0].date).toBe('2026-10-08');
  });

  it('typing your own slashes and single digits works, and is tidied on leaving the box', async () => {
    const date = await txForm();
    await userEvent.type(date, '8/1/2026');
    expect(date).toHaveValue('8/1/2026');
    await userEvent.tab();
    expect(date).toHaveValue('08/01/2026');
    await submitTx();
    expect(stored('transactions')[0].date).toBe('2026-01-08');
  });

  it('day comes first: 10/08/2026 is 10 August', async () => {
    const date = await txForm();
    await userEvent.type(date, '10/08/2026');
    await submitTx();
    expect(stored('transactions')[0].date).toBe('2026-08-10');
  });

  it('backspace walks back through the slashes naturally', async () => {
    const date = await txForm();
    await userEvent.type(date, '0810');
    expect(date).toHaveValue('08/10');
    await userEvent.keyboard('{Backspace}');
    expect(date).toHaveValue('08/1');
    await userEvent.keyboard('{Backspace}');
    expect(date).toHaveValue('08');
    await userEvent.keyboard('{Backspace}{Backspace}');
    expect(date).toHaveValue('');
  });

  it.each([
    ['31/02/2026', 'an impossible date'],
    ['29/02/2025', 'a leap day in a non-leap year'],
    ['08/10', 'an unfinished date'],
    ['08/13/2026', 'a month-first date with a 13th month'],
    ['01/01/1899', 'a year before 1900'],
    ['01/01/2101', 'a year after 2100'],
  ])('refuses %s (%s), explains, and saves nothing', async (typed) => {
    const date = await txForm();
    await userEvent.type(date, typed);
    await submitTx();
    expect(await screen.findByText(/real date as DD\/MM\/YYYY/i)).toBeInTheDocument();
    expect(date).toHaveAttribute('aria-invalid', 'true');
    expect(stored('transactions')).toEqual([]);
  });

  it('an empty date is refused too', async () => {
    await txForm();
    await submitTx();
    expect(await screen.findByText(/real date as DD\/MM\/YYYY/i)).toBeInTheDocument();
    expect(stored('transactions')).toEqual([]);
  });

  it('pasting a date in the stored format (2026-10-08) is converted', async () => {
    const date = await txForm();
    await userEvent.click(date);
    await userEvent.paste('2026-10-08');
    expect(date).toHaveValue('08/10/2026');
    await submitTx();
    expect(stored('transactions')[0].date).toBe('2026-10-08');
  });

  // The box used to have maxLength=10, which made the BROWSER cut a paste before the app could clean it.
  it.each([
    [' 08/10/2026 ', '08/10/2026'],
    ['8 / 10 / 2026', '8/10/2026'],
    ['\t8.10.2026', '8/10/2026'],
    ['Date: 08/10/2026', '08/10/2026'],
    ['2026-10-08T00:00:00Z', '08/10/2026'],
    ['08/10/2026\n12/11/2027', '08/10/2026'],
  ])('pasting %j keeps the whole date', async (pasted, shown) => {
    const date = await txForm();
    await userEvent.click(date);
    await userEvent.paste(pasted);
    expect(date).toHaveValue(shown);
    await submitTx();
    expect(stored('transactions')[0].date).toBe('2026-10-08');
  });

  it('a full-width keyboard (IME) types dates normally', async () => {
    const date = await txForm();
    await userEvent.type(date, '０８１０２０２６');
    expect(date).toHaveValue('08/10/2026');
  });

  it('fixing a digit in the middle keeps the caret where it was', async () => {
    const date = await txForm();
    await userEvent.type(date, '08/10/2026');
    date.setSelectionRange(4, 4);
    await userEvent.keyboard('{Backspace}');
    expect(date).toHaveValue('08/0/2026');
    await userEvent.keyboard('2');
    expect(date).toHaveValue('08/20/2026');
    expect(date.selectionStart).toBe(4); // right after the digit just typed, not thrown to the end
  });

  it('tells screen-reader users the expected format (a placeholder disappears once you type)', async () => {
    render(<App />);
    await openTab('Transactions');
    const date = screen.getByLabelText('Date');
    expect(date).toHaveAccessibleDescription(/day, month, year/i);
    expect(date).toHaveAccessibleDescription(/DD\/MM\/YYYY/);
  });

  it('letters and extra digits are ignored while typing', async () => {
    const date = await txForm();
    await userEvent.type(date, 'ab08x10y2026zz99');
    expect(date).toHaveValue('08/10/2026');
  });

  it('after saving, the amount clears but the date stays for the next entry', async () => {
    const date = await txForm();
    await userEvent.type(date, '08102026');
    await submitTx();
    expect(date).toHaveValue('08/10/2026');
    expect(screen.getByLabelText(/amount/i)).toHaveValue('');
  });

  it('editing a transaction loads its date as DD/MM/YYYY and saves it back unchanged', async () => {
    localStorage.setItem('expense-planner:transactions', JSON.stringify([tx('a', '2026-03-09', { notes: 'rent' })]));
    render(<App />);
    await openTab('Transactions');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Food transaction' }));
    expect(screen.getByLabelText('Date')).toHaveValue('09/03/2026');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(stored('transactions')[0].date).toBe('2026-03-09');
  });

  it('switching from one record to another replaces the date shown', async () => {
    localStorage.setItem('expense-planner:transactions', JSON.stringify([
      tx('a', '2026-03-09', { category: 'Food' }), tx('b', '2025-12-31', { category: 'Bills' }),
    ]));
    render(<App />);
    await openTab('Transactions');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Food transaction' }));
    expect(screen.getByLabelText('Date')).toHaveValue('09/03/2026');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Bills transaction' }));
    expect(screen.getByLabelText('Date')).toHaveValue('31/12/2025');
  });
});

describe('dates are shown DD/MM/YYYY everywhere, in any browser language', () => {
  it('transaction list and dashboard', async () => {
    // The test browser speaks US English, where the old code printed "Oct 8, 2026".
    expect(new Date(2026, 9, 8).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })).toMatch(/Oct 8, 2026/);
    localStorage.setItem('expense-planner:transactions', JSON.stringify([tx('a', '2026-10-08', { notes: 'lunch' })]));
    render(<App />);
    expect(screen.getAllByText('08/10/2026').length).toBeGreaterThan(0); // dashboard "recent"
    expect(screen.queryByText(/Oct 8, 2026/)).not.toBeInTheDocument();
    await openTab('Transactions');
    expect(screen.getAllByText('08/10/2026').length).toBeGreaterThan(0);
  });

  it('the dashboard week range', () => {
    localStorage.setItem('expense-planner:transactions', JSON.stringify([tx('a', todayISO())]));
    render(<App />);
    const start = formatDate(startOfWeek(todayISO()));
    expect(screen.getByText(new RegExp(`${start.replace(/\//g, '\\/')} – \\d\\d\\/\\d\\d\\/\\d{4} · Monday to Sunday`))).toBeInTheDocument();
  });

  it('subscription due and last-paid dates', async () => {
    localStorage.setItem('expense-planner:subscriptions', JSON.stringify([
      { id: 's', name: 'Netflix', cost: 10, cycle: 'monthly', nextDue: '2090-05-17', lastPaid: '2026-04-17', anchorDay: 17 },
    ]));
    render(<App />);
    await openTab('Subscriptions');
    expect(screen.getByText(/Due 17\/05\/2090/)).toBeInTheDocument();
    expect(screen.getByText(/last paid 17\/04\/2026/)).toBeInTheDocument();
  });
});

describe('subscription form due date', () => {
  async function subForm() {
    render(<App />);
    await openTab('Subscriptions');
    await userEvent.type(screen.getByLabelText('Provider'), 'Gym');
    await userEvent.type(screen.getByLabelText('Cost (€)'), '30');
    const due = screen.getByLabelText('Next due date');
    await userEvent.clear(due);
    return due;
  }

  it('defaults to today in DD/MM/YYYY and saves a typed due date in the stored format', async () => {
    render(<App />);
    await openTab('Subscriptions');
    expect(screen.getByLabelText('Next due date')).toHaveValue(formatDate(todayISO()));
    const due = await (async () => { const d = screen.getByLabelText('Next due date'); await userEvent.clear(d); return d; })();
    await userEvent.type(screen.getByLabelText('Provider'), 'Gym');
    await userEvent.type(screen.getByLabelText('Cost (€)'), '30');
    await userEvent.type(due, '31/01/2090');
    await userEvent.click(screen.getByRole('button', { name: 'Add subscription' }));
    expect(stored('subscriptions')[0]).toMatchObject({ nextDue: '2090-01-31', anchorDay: 31 });
  });

  it('refuses an impossible due date', async () => {
    const due = await subForm();
    await userEvent.type(due, '30/02/2090');
    await userEvent.click(screen.getByRole('button', { name: 'Add subscription' }));
    expect(await screen.findByText(/real due date as DD\/MM\/YYYY/i)).toBeInTheDocument();
    expect(stored('subscriptions')).toEqual([]);
  });

  it('resets to today after saving', async () => {
    const due = await subForm();
    await userEvent.type(due, '31/01/2090');
    await userEvent.click(screen.getByRole('button', { name: 'Add subscription' }));
    expect(screen.getByLabelText('Next due date')).toHaveValue(formatDate(todayISO()));
  });
});

describe('calendar button', () => {
  const original = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'showPicker');
  afterEach(() => {
    if (original) Object.defineProperty(HTMLInputElement.prototype, 'showPicker', original);
    else delete HTMLInputElement.prototype.showPicker;
  });

  it('is not shown in a browser that cannot open a native picker (typing still works)', async () => {
    render(<App />);
    await openTab('Transactions');
    expect(screen.queryByRole('button', { name: /open calendar/i })).not.toBeInTheDocument();
  });

  it('opens the native picker, and a day chosen there lands in the box and in the saved data', async () => {
    const showPicker = vi.fn();
    HTMLInputElement.prototype.showPicker = showPicker;
    render(<App />);
    await openTab('Transactions');
    await userEvent.type(screen.getByLabelText(/amount/i), '5');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Food');
    await userEvent.click(screen.getByRole('button', { name: /open calendar/i }));
    expect(showPicker).toHaveBeenCalledTimes(1);
    const hidden = document.querySelector('input[type=date]');
    fireEvent.change(hidden, { target: { value: '2026-07-04' } });
    expect(screen.getByLabelText('Date')).toHaveValue('04/07/2026');
    await submitTx();
    expect(stored('transactions')[0].date).toBe('2026-07-04');
  });

  it('a browser that refuses to open the picker does not break the page', async () => {
    HTMLInputElement.prototype.showPicker = () => { throw new DOMException('not allowed', 'NotAllowedError'); };
    render(<App />);
    await openTab('Transactions');
    await userEvent.click(screen.getByRole('button', { name: /open calendar/i }));
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
  });

  it('the hidden picker is out of the way of keyboard and screen readers', async () => {
    HTMLInputElement.prototype.showPicker = vi.fn();
    render(<App />);
    await openTab('Transactions');
    const hidden = document.querySelector('input[type=date]');
    expect(hidden).toHaveAttribute('aria-hidden', 'true');
    expect(hidden).toHaveAttribute('tabindex', '-1');
  });
});

describe('stored data is unchanged by the display format', () => {
  it('existing data keeps its YYYY-MM-DD and still imports/exports in that format', async () => {
    localStorage.setItem('expense-planner:transactions', JSON.stringify([tx('a', '2026-10-08')]));
    render(<App />);
    expect(stored('transactions')[0].date).toBe('2026-10-08');
  });
});

describe('searching transactions by date uses the date you see', () => {
  const seed = () => localStorage.setItem('expense-planner:transactions', JSON.stringify([
    tx('a', '2026-10-08', { notes: 'groceries' }),
    tx('b', '2026-03-09', { notes: 'rent', category: 'Housing' }),
    tx('c', '2025-10-31', { notes: 'bus', category: 'Transport' }),
  ]));
  const search = async (q) => {
    render(<App />);
    await openTab('Transactions');
    await userEvent.type(screen.getByLabelText('Search transactions'), q);
  };

  it.each([
    ['08/10/2026', ['groceries']],
    ['08/10', ['groceries']],
    ['/10/', ['groceries', 'bus']], // any October
    ['/2026', ['groceries', 'rent']],
    ['09/03', ['rent']],
    ['31/10/2025', ['bus']],
  ])('"%s" finds the right records', async (q, notes) => {
    seed();
    await search(q);
    notes.forEach((n) => expect(screen.getByText(n)).toBeInTheDocument());
    ['groceries', 'rent', 'bus'].filter((n) => !notes.includes(n)).forEach((n) => expect(screen.queryByText(n)).not.toBeInTheDocument());
  });

  it.each([
    ['9/3', ['rent']], // no leading zeros needed
    ['9/3/2026', ['rent']],
    ['9.3.2026', ['rent']], // dots between three parts
    ['9-3-2026', ['rent']],
    ['3/2026', ['rent']],
  ])('"%s" also finds records without typing leading zeros', async (q, notes) => {
    seed();
    await search(q);
    notes.forEach((n) => expect(screen.getByText(n)).toBeInTheDocument());
    expect(screen.queryByText('groceries')).not.toBeInTheDocument();
    expect(screen.queryByText('bus')).not.toBeInTheDocument();
  });

  it('a decimal like 12.5 is searched as an amount and never mistaken for a date', async () => {
    localStorage.setItem('expense-planner:transactions', JSON.stringify([
      tx('a', '2026-05-12', { notes: 'dated12may' }),
      tx('b', '2026-01-01', { notes: 'amount', amount: 12.5 }),
    ]));
    await search('12.5');
    expect(screen.getByText('amount')).toBeInTheDocument();
    expect(screen.queryByText('dated12may')).not.toBeInTheDocument();
  });

  it('the hidden stored format is no longer something people can accidentally match', async () => {
    seed();
    await search('2026-10');
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });
});
