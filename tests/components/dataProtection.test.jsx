import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { resetPersistenceAskedForTests } from '../../src/hooks/useRequestPersistence';
import { todayISO } from '../../src/utils/dates';

const tx = { id: 'a', type: 'expense', amount: 5, category: 'Food', date: '2026-10-08', notes: '' };
const seedData = () => localStorage.setItem('expense-planner:transactions', JSON.stringify([tx]));
const seedStatus = (s) => localStorage.setItem('expense-planner:backup-status', JSON.stringify(s));
const status = () => JSON.parse(localStorage.getItem('expense-planner:backup-status'));

const original = Object.getOwnPropertyDescriptor(navigator, 'storage');
const setStorage = (value) => Object.defineProperty(navigator, 'storage', { value, configurable: true });

let downloads;
beforeEach(() => {
  resetPersistenceAskedForTests();
  downloads = [];
  URL.createObjectURL = vi.fn(() => 'blob:test');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() { downloads.push(this.download); });
});
afterEach(() => {
  if (original) Object.defineProperty(navigator, 'storage', original);
  else delete navigator.storage;
});

describe('backup reminder on the Dashboard', () => {
  it('appears for old unbacked-up data, and Export downloads a backup, records today and hides itself', async () => {
    seedData();
    seedStatus({ lastBackup: null, since: '2020-01-01', snoozeUntil: null });
    render(<App />);
    expect(screen.getByRole('region', { name: /backup reminder/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /export a backup now/i }));
    expect(downloads).toEqual([`pocket-book-backup-${todayISO()}.json`]);
    expect(status().lastBackup).toBe(todayISO());
    expect(screen.queryByRole('region', { name: /backup reminder/i })).not.toBeInTheDocument();
  });

  it('"Remind me in 7 days" hides it and stores the snooze', async () => {
    seedData();
    seedStatus({ lastBackup: '2020-01-01', since: '2020-01-01', snoozeUntil: null });
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /remind me in 7 days/i }));
    expect(screen.queryByRole('region', { name: /backup reminder/i })).not.toBeInTheDocument();
    expect(status().snoozeUntil > todayISO()).toBe(true);
    expect(downloads).toEqual([]);
  });

  const noReminder = () => expect(screen.queryByRole('region', { name: /backup reminder/i })).not.toBeInTheDocument();

  it('stays away after a recent backup', () => {
    seedData();
    seedStatus({ lastBackup: todayISO(), since: '2020-01-01', snoozeUntil: null });
    render(<App />);
    noReminder();
  });

  it('stays away while a snooze is running', () => {
    seedData();
    seedStatus({ lastBackup: null, since: '2020-01-01', snoozeUntil: '2100-01-01' });
    render(<App />);
    noReminder();
  });

  it('stays away for data it has only just noticed (no immediate nagging)', () => {
    seedData(); // no status stored yet
    render(<App />);
    noReminder();
  });

  it('never shows without any data', () => {
    seedStatus({ lastBackup: null, since: '2020-01-01', snoozeUntil: null });
    render(<App />);
    expect(screen.queryByRole('region', { name: /backup reminder/i })).not.toBeInTheDocument();
  });

  it('first sighting of data records today as the starting point; deleting everything resets it', async () => {
    render(<App />);
    expect(status().since).toBeNull(); // nothing to protect yet
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'expense-planner:transactions', newValue: JSON.stringify([tx]) }));
    });
    await waitFor(() => expect(status().since).toBe(todayISO()));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'expense-planner:transactions', newValue: '[]' }));
    });
    await waitFor(() => expect(status().since).toBeNull());
  });

  it('a corrupt status value is ignored safely', () => {
    seedData();
    localStorage.setItem('expense-planner:backup-status', '{{broken');
    render(<App />);
    expect(screen.queryByRole('region', { name: /backup reminder/i })).not.toBeInTheDocument();
    expect(localStorage.getItem('expense-planner:backup-status:corrupt-backup')).toBe('{{broken');
  });
});

describe('asking the browser to protect the data on launch', () => {
  it('asks once there is data', async () => {
    const persist = vi.fn(async () => true);
    setStorage({ persisted: async () => false, persist });
    seedData();
    render(<App />);
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
  });

  it('asks only once per page load, even if the app remounts', async () => {
    const persist = vi.fn(async () => true);
    setStorage({ persisted: async () => false, persist });
    seedData();
    const first = render(<App />);
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<App />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does not ask while there is nothing to protect', async () => {
    const persist = vi.fn(async () => true);
    setStorage({ persisted: async () => false, persist });
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    expect(persist).not.toHaveBeenCalled();
  });

  it('works in a browser without the API', () => {
    setStorage(undefined);
    seedData();
    expect(() => render(<App />)).not.toThrow();
  });
});

describe('Settings > Backup', () => {
  const openSettings = () => userEvent.click(screen.getByRole('button', { name: /open settings/i }));

  it('the normal Export data button also counts as a backup', async () => {
    setStorage(undefined);
    seedData();
    render(<App />);
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: /export data/i }));
    expect(status().lastBackup).toBe(todayISO());
  });
});
