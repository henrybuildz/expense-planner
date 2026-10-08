import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DataBackup from '../../src/components/backup/DataBackup';
import { AppProvider } from '../../src/context/AppContext';
import { UndoProvider, useUndo } from '../../src/context/UndoContext';

const sync = { signedIn: false, permitMassDelete: vi.fn() };
vi.mock('../../src/context/SyncContext', () => ({ useSync: () => sync }));

const tx = (id) => ({ id, type: 'expense', amount: 5, category: 'Food', date: '2026-10-08', notes: '' });
const stored = () => JSON.parse(localStorage.getItem('expense-planner:transactions') || '[]');

const mount = () =>
  render(
    <AppProvider>
      <UndoProvider>
        <DataBackup />
      </UndoProvider>
    </AppProvider>
  );

beforeEach(() => {
  sync.signedIn = false;
  sync.permitMassDelete.mockClear();
  localStorage.setItem('expense-planner:transactions', JSON.stringify([tx('a'), tx('b')]));
  window.confirm = vi.fn(() => true);
});

describe('Delete all data', () => {
  it('asks inline (no browser pop-up) and Cancel keeps everything', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Delete all data' }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: /confirm delete all data/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: /confirm delete all data/i })).not.toBeInTheDocument();
    expect(stored()).toHaveLength(2);
    expect(sync.permitMassDelete).not.toHaveBeenCalled();
  });

  it('signed out: says it only affects this device, and one click on "Delete everything" does it', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Delete all data' }));
    expect(screen.getByText(/only deletes the data on this device/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/type delete/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
    expect(stored()).toEqual([]);
    expect(sync.permitMassDelete).toHaveBeenCalledTimes(1);
  });

  it('signed in: warns about every device and needs DELETE typed before anything happens', async () => {
    sync.signedIn = true;
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Delete all data' }));
    expect(screen.getByText(/also deletes your synced copy on every device/i)).toBeInTheDocument();
    const go = screen.getByRole('button', { name: 'Delete everything' });
    expect(go).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), 'delet');
    expect(go).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/type delete to confirm/i), 'e');
    expect(go).toBeEnabled();
    await userEvent.click(go);
    expect(stored()).toEqual([]);
    expect(sync.permitMassDelete).toHaveBeenCalledTimes(1);
  });

  it('Cancel hands the keyboard back to the "Delete all data" button', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Delete all data' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Delete all data' })).toHaveFocus());
  });

  it('the confirmation disappears if the data is already gone (e.g. deleted in another tab)', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Delete all data' }));
    expect(screen.getByRole('group', { name: /confirm delete all data/i })).toBeInTheDocument();
    await act(async () => {
      localStorage.setItem('expense-planner:transactions', '[]');
      window.dispatchEvent(new StorageEvent('storage', { key: 'expense-planner:transactions', newValue: '[]', storageArea: localStorage }));
    });
    expect(screen.queryByRole('group', { name: /confirm delete all data/i })).not.toBeInTheDocument();
  });

  it('Escape closes the confirmation without deleting', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Delete all data' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: /confirm delete all data/i })).not.toBeInTheDocument();
    expect(stored()).toHaveLength(2);
  });
});

describe('information-only notices (no Undo)', () => {
  function Probe() {
    const { notify } = useUndo();
    return (
      <>
        <button onClick={() => notify({ message: 'Deleted on another device', detail: 'info' })}>notice</button>
        <button onClick={() => notify({ message: 'Expense deleted', onUndo: () => document.body.setAttribute('data-undone', '1') })}>real</button>
      </>
    );
  }

  it('show no Undo button, and Cmd/Ctrl+Z undoes the newest real delete, not the notice', async () => {
    render(<UndoProvider><Probe /></UndoProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'real' }));
    await userEvent.click(screen.getByRole('button', { name: 'notice' })); // newest, but nothing to undo
    expect(screen.getByText('Deleted on another device')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1);
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(document.body.getAttribute('data-undone')).toBe('1');
    document.body.removeAttribute('data-undone');
  });
});

describe('notice stack', () => {
  it('a burst of notices never pushes out a bar that can still be undone', async () => {
    function Burst() {
      const { notify } = useUndo();
      return (
        <>
          <button onClick={() => notify({ message: 'Real delete', onUndo: () => {} })}>real</button>
          <button onClick={() => notify({ message: 'Notice' })}>notice</button>
        </>
      );
    }
    render(<UndoProvider><Burst /></UndoProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'real' })); // the oldest bar
    for (let i = 0; i < 6; i += 1) await userEvent.click(screen.getByRole('button', { name: 'notice' }));
    expect(screen.getByText('Real delete')).toBeInTheDocument();
    expect(screen.getAllByText('Notice').length).toBeLessThanOrEqual(4);
  });
});
