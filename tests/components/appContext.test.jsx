import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from '../../src/context/AppContext';

const tx = (id, o = {}) => ({ id, type: 'expense', amount: 5, category: 'Food', date: '2026-10-08', notes: '', ...o });
const sub = (id, o = {}) => ({ id, name: 'Netflix', cost: 9.99, cycle: 'monthly', nextDue: '2026-10-31', lastPaid: '', anchorDay: 31, ...o });

const mount = (seed = {}) => {
  Object.entries(seed).forEach(([k, v]) => localStorage.setItem(`expense-planner:${k}`, JSON.stringify(v)));
  return renderHook(() => useApp(), { wrapper: AppProvider });
};

describe('AppContext actions', () => {
  it('adds, edits and deletes transactions with fresh unique ids', () => {
    const { result } = mount();
    act(() => { result.current.addTransaction({ type: 'income', amount: 10, category: 'Salary', date: '2026-10-01', notes: '' }); result.current.addTransaction({ type: 'expense', amount: 3, category: 'Food', date: '2026-10-02', notes: '' }); });
    const [a, b] = result.current.transactions;
    expect(a.id).not.toBe(b.id);
    act(() => result.current.updateTransaction(a.id, { amount: 99 }));
    expect(result.current.transactions.find((t) => t.id === a.id).amount).toBe(99);
    act(() => result.current.deleteTransaction(a.id));
    expect(result.current.transactions.map((t) => t.id)).toEqual([b.id]);
  });

  it('persists to localStorage and reloads the same data', () => {
    const { result, unmount } = mount();
    act(() => result.current.setBudget('Food', 250));
    unmount();
    const again = renderHook(() => useApp(), { wrapper: AppProvider });
    expect(again.result.current.budgets).toEqual({ Food: 250 });
  });

  it('subscriptions keep their anchor day so month-end bills do not drift', () => {
    const { result } = mount();
    act(() => result.current.addSubscription({ name: 'Rent', cost: 100, cycle: 'monthly', nextDue: '2026-01-31' }));
    const id = result.current.subscriptions[0].id;
    expect(result.current.subscriptions[0].anchorDay).toBe(31);
    const seen = [];
    for (let i = 0; i < 4; i += 1) {
      act(() => result.current.markSubscriptionPaid(id));
      seen.push(result.current.subscriptions[0].nextDue);
    }
    expect(seen).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('paying a subscription also records the expense, and undoing removes only that', () => {
    const { result } = mount({ subscriptions: [sub('s1', { cost: 12.5, name: 'Gym', nextDue: '2026-10-08', anchorDay: 8 })], transactions: [tx('keep')] });
    const before = result.current.subscriptions[0];
    let txId;
    act(() => { txId = result.current.paySubscription(before); });
    const paid = result.current.transactions.find((t) => t.id === txId);
    expect(paid).toMatchObject({ type: 'expense', amount: 12.5, category: 'Subscriptions', notes: 'Gym' });
    expect(result.current.subscriptions[0].nextDue).toBe('2026-11-08');
    act(() => result.current.undoPaySubscription(before, txId));
    expect(result.current.subscriptions[0]).toMatchObject({ nextDue: '2026-10-08', lastPaid: '' });
    expect(result.current.transactions.map((t) => t.id)).toEqual(['keep']);
  });

  it('editing the due date re-anchors the bill', () => {
    const { result } = mount({ subscriptions: [sub('s1')] });
    act(() => result.current.updateSubscription('s1', { nextDue: '2026-10-15' }));
    expect(result.current.subscriptions[0].anchorDay).toBe(15);
  });
});

describe('Undo restore actions', () => {
  it('put back exactly what was deleted, once', () => {
    const t = tx('a', { notes: 'lunch' });
    const { result } = mount({ transactions: [t, tx('b')], subscriptions: [sub('s1')], budgets: { Food: 100 } });
    act(() => { result.current.deleteTransaction('a'); result.current.deleteSubscription('s1'); result.current.removeBudget('Food'); });
    expect(result.current.transactions).toHaveLength(1);
    act(() => { result.current.restoreTransaction(t); result.current.restoreSubscription(sub('s1')); result.current.restoreBudget('Food', 100); });
    expect(result.current.transactions.find((x) => x.id === 'a')).toEqual(t);
    expect(result.current.subscriptions).toEqual([sub('s1')]);
    expect(result.current.budgets).toEqual({ Food: 100 });
    act(() => { result.current.restoreTransaction(t); result.current.restoreSubscription(sub('s1')); });
    expect(result.current.transactions.filter((x) => x.id === 'a')).toHaveLength(1);
    expect(result.current.subscriptions).toHaveLength(1);
  });

  it('never overwrite something created in its place meanwhile', () => {
    const { result } = mount({ budgets: { Food: 100 } });
    act(() => result.current.removeBudget('Food'));
    act(() => result.current.setBudget('Food', 999));
    act(() => result.current.restoreBudget('Food', 100));
    expect(result.current.budgets.Food).toBe(999);
  });
});

describe('import actions', () => {
  it('merge keeps existing records, skips duplicate ids and overrides budgets per category', () => {
    const { result } = mount({ transactions: [tx('a', { amount: 1 })], budgets: { Food: 100, Bills: 50 } });
    act(() => result.current.mergeAll({ transactions: [tx('a', { amount: 999 }), tx('b')], budgets: { Food: 300 } }));
    expect(result.current.transactions.map((t) => t.id).sort()).toEqual(['a', 'b']);
    expect(result.current.transactions.find((t) => t.id === 'a').amount).toBe(1);
    expect(result.current.budgets).toEqual({ Food: 300, Bills: 50 });
  });

  it('replace only touches the sections present in the file', () => {
    const { result } = mount({ transactions: [tx('a')], budgets: { Food: 100 } });
    act(() => result.current.replaceAll({ transactions: [tx('z')] }));
    expect(result.current.transactions.map((t) => t.id)).toEqual(['z']);
    expect(result.current.budgets).toEqual({ Food: 100 });
  });

  // Regression: Undo of a Replace used to restore a whole snapshot and erase records added afterwards.
  it('undoing a Replace restores the old records but keeps records added since', () => {
    const before = { transactions: [tx('old1'), tx('old2')], budgets: { Food: 100 }, subscriptions: [] };
    const imported = { transactions: [tx('new1')], budgets: { Bills: 5 }, subscriptions: [] };
    const { result } = mount(before);
    act(() => result.current.replaceAll(imported));
    act(() => result.current.addTransaction({ type: 'expense', amount: 7, category: 'Food', date: '2026-10-08', notes: 'added after import' }));
    act(() => result.current.undoReplace(imported, before));
    const notes = result.current.transactions.map((t) => t.notes);
    expect(result.current.transactions.map((t) => t.id)).toEqual(expect.arrayContaining(['old1', 'old2']));
    expect(result.current.transactions.map((t) => t.id)).not.toContain('new1');
    expect(notes).toContain('added after import');
    expect(result.current.budgets).toEqual({ Food: 100 });
  });

  it('clearAll empties everything', () => {
    const { result } = mount({ transactions: [tx('a')], budgets: { Food: 1 }, subscriptions: [sub('s')] });
    act(() => result.current.clearAll());
    expect([result.current.transactions, result.current.budgets, result.current.subscriptions]).toEqual([[], {}, []]);
  });
});

describe('sync hook-in', () => {
  it('updateTable applies functional updates on the freshest state', () => {
    const { result } = mount({ transactions: [tx('a')] });
    act(() => {
      result.current.addTransaction({ type: 'expense', amount: 2, category: 'Food', date: '2026-10-08', notes: 'typed during sync' });
      result.current.updateTable('transactions', (prev) => [...prev, tx('from-server')]);
    });
    const ids = result.current.transactions.map((t) => t.id);
    expect(ids).toContain('from-server');
    expect(ids).toHaveLength(3);
  });

  it('useApp outside the provider fails loudly', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useApp())).toThrow(/AppProvider/);
  });
});
