import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UndoProvider, useUndo } from '../../src/context/UndoContext';
import { UNDO_MS } from '../../src/components/ui/UndoBar';

let api;
function Grab() {
  api = useUndo();
  return null;
}
const mount = () => render(<UndoProvider><Grab /><input aria-label="field" /></UndoProvider>);

afterEach(() => vi.useRealTimers());

describe('undo bar', () => {
  it('shows the message and runs onUndo exactly once when Undo is clicked', async () => {
    mount();
    const onUndo = vi.fn();
    act(() => { api.notify({ message: 'Transaction deleted', detail: 'Lunch', onUndo }); });
    expect(screen.getByText('Transaction deleted')).toBeInTheDocument();
    expect(screen.getByText('Lunch')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Transaction deleted')).not.toBeInTheDocument();
  });

  it('closes by itself after the window and does NOT undo', () => {
    vi.useFakeTimers();
    mount();
    const onUndo = vi.fn();
    act(() => { api.notify({ message: 'Gone', onUndo }); });
    act(() => { vi.advanceTimersByTime(UNDO_MS - 100); });
    expect(screen.getByText('Gone')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText('Gone')).not.toBeInTheDocument();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('Dismiss closes without undoing', async () => {
    mount();
    const onUndo = vi.fn();
    act(() => { api.notify({ message: 'Gone', onUndo }); });
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Gone')).not.toBeInTheDocument();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('hovering pauses the countdown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    mount();
    act(() => { api.notify({ message: 'Hover me', onUndo: vi.fn() }); });
    const toast = screen.getByText('Hover me').closest('.toast-in');
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { toast.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    // React's onMouseEnter listens to mouseover/mouseout
    act(() => { vi.advanceTimersByTime(60000); });
    expect(screen.queryByText('Hover me')).toBeInTheDocument();
    act(() => { toast.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })); });
    act(() => { vi.advanceTimersByTime(UNDO_MS - 2900); });
    expect(screen.queryByText('Hover me')).not.toBeInTheDocument();
  });

  it('Cmd/Ctrl+Z undoes the newest delete only', async () => {
    mount();
    const first = vi.fn();
    const second = vi.fn();
    act(() => { api.notify({ message: 'First', onUndo: first }); api.notify({ message: 'Second', onUndo: second }); });
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    await userEvent.keyboard('{Meta>}z{/Meta}');
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('never steals Cmd/Ctrl+Z from a text field, and ignores Shift/Alt variants', async () => {
    mount();
    const onUndo = vi.fn();
    act(() => { api.notify({ message: 'Keep', onUndo }); });
    await userEvent.click(screen.getByLabelText('field'));
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(onUndo).not.toHaveBeenCalled();
    screen.getByLabelText('field').blur();
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await userEvent.keyboard('{Control>}{Alt>}z{/Alt}{/Control}');
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('a burst of deletes stacks at most five bars; the oldest just closes', () => {
    mount();
    act(() => { for (let i = 1; i <= 7; i += 1) api.notify({ message: `Item ${i}`, onUndo: vi.fn() }); });
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(5);
    expect(screen.queryByText('Item 2')).not.toBeInTheDocument();
    expect(screen.getByText('Item 7')).toBeInTheDocument();
  });

  it('dismissAll clears every bar without undoing anything', () => {
    mount();
    const onUndo = vi.fn();
    act(() => { api.notify({ message: 'A', onUndo }); api.notify({ message: 'B', onUndo }); });
    act(() => api.dismissAll());
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('useUndo outside the provider fails loudly', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Grab />)).toThrow(/UndoProvider/);
  });
});
