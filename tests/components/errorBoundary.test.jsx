import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ErrorBoundary from '../../src/components/system/ErrorBoundary';

let shouldThrow;
function Bomb() {
  if (shouldThrow) throw new Error('kaboom');
  return <p>all good</p>;
}

beforeEach(() => {
  shouldThrow = true;
  vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs caught errors
});

describe('ErrorBoundary', () => {
  it('renders children normally', () => {
    shouldThrow = false;
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('shows the full-screen crash screen with the actions, focused for keyboard users', () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('heading', { level: 1, name: /something went wrong/i })).toBeInTheDocument();
    ['Try again', 'Reload', 'Export my data'].forEach((n) => expect(screen.getByRole('button', { name: n })).toBeInTheDocument());
    expect(alert).toHaveFocus();
  });

  it('the panel variant uses an h2 (the page already has an h1) and says the rest still works', () => {
    render(<ErrorBoundary variant="panel"><Bomb /></ErrorBoundary>);
    expect(screen.getByRole('heading', { level: 2, name: /this part hit a problem/i })).toBeInTheDocument();
    expect(screen.getByText(/rest of the app still works/i)).toBeInTheDocument();
  });

  it('"Try again" recovers once the cause is gone', async () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('crashing again right after "Try again" explains that retrying did not help', async () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    expect(screen.queryByText(/did not fix it/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText(/that did not fix it/i)).toBeInTheDocument();
  });

  it('changing resetKey (switching tab) retries without the "did not fix it" warning', () => {
    const { rerender } = render(<ErrorBoundary resetKey="a"><Bomb /></ErrorBoundary>);
    shouldThrow = false;
    rerender(<ErrorBoundary resetKey="b"><Bomb /></ErrorBoundary>);
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('technical details hold the error and browser but no financial data', () => {
    localStorage.setItem('expense-planner:transactions', JSON.stringify([{ id: 'a', amount: 123456.78, notes: 'SECRET-NOTE' }]));
    const { container } = render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    const report = container.querySelector('pre').textContent;
    expect(report).toContain('Error: kaboom');
    expect(report).toContain('Browser:');
    expect(report).not.toContain('SECRET-NOTE');
    expect(report).not.toContain('123456.78');
  });

  it('"Export my data" downloads a backup and confirms', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    await userEvent.click(screen.getByRole('button', { name: 'Export my data' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(/saved a copy of your data/i);
  });

  it('"Start fresh" does nothing when the confirmation is declined', async () => {
    localStorage.setItem('expense-planner:transactions', '[]');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { container } = render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    container.querySelector('details').open = true;
    await userEvent.click(screen.getByRole('button', { name: /start fresh/i }));
    expect(click).not.toHaveBeenCalled();
    expect(localStorage.getItem('expense-planner:transactions')).toBe('[]');
  });

  it('"Start fresh" backs up first, then clears the data, then schedules a reload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.setItem('expense-planner:transactions', '[{"id":"a"}]');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { container } = render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    container.querySelector('details').open = true;
    await userEvent.click(screen.getByRole('button', { name: /start fresh/i }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('expense-planner:transactions')).toBeNull();
    expect(localStorage.getItem('expense-planner:crash-backup')).toContain('"id\\":\\"a');
    expect(screen.getByRole('status')).toHaveTextContent(/backed up and cleared/i);
  });

  it('shows a readable message when copying fails', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('no')) }, configurable: true });
    const { container } = render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    container.querySelector('details').open = true;
    await user.click(screen.getByRole('button', { name: /copy details/i }));
    expect(await screen.findByText(/could not copy automatically/i)).toBeInTheDocument();
  });
});
