import { describe, expect, it } from 'vitest';
import { sanitizeBudgets, sanitizeSubscriptions, sanitizeTab, sanitizeTransactions } from '../src/utils/sanitize';

const tx = (over = {}) => ({ id: 't1', type: 'expense', amount: 12.5, category: 'Food', date: '2026-10-08', notes: 'x', ...over });
const sub = (over = {}) => ({ id: 's1', name: 'Netflix', cost: 9.99, cycle: 'monthly', nextDue: '2026-10-20', lastPaid: '', anchorDay: 20, ...over });

describe('sanitizeTransactions', () => {
  it('keeps valid records unchanged', () => {
    expect(sanitizeTransactions([tx()])).toEqual([tx()]);
  });

  it('returns undefined (unusable) for anything that is not an array', () => {
    [null, undefined, 5, 'x', {}, true].forEach((v) => expect(sanitizeTransactions(v)).toBeUndefined());
  });

  it('drops records that break any rule, keeping the good ones', () => {
    const bad = [
      null, 5, 'str', [], {},
      tx({ id: '' }), tx({ id: 'has space' }), tx({ id: 'a,b' }), tx({ id: 'q"uote' }), tx({ id: 'x'.repeat(65) }), tx({ id: 5 }),
      tx({ type: 'transfer' }), tx({ type: undefined }),
      tx({ amount: 0 }), tx({ amount: -1 }), tx({ amount: NaN }), tx({ amount: Infinity }), tx({ amount: '5' }), tx({ amount: 1e9 + 1 }),
      tx({ date: '2026-02-31' }), tx({ date: '1800-01-01' }), tx({ date: 'yesterday' }), tx({ date: undefined }),
      tx({ category: '' }), tx({ category: '   ' }), tx({ category: 7 }),
    ];
    const out = sanitizeTransactions([...bad, tx({ id: 'good' })]);
    expect(out.map((t) => t.id)).toEqual(['good']);
  });

  it('keeps the boundary values that are allowed', () => {
    const out = sanitizeTransactions([
      tx({ id: 'a', amount: 0.01 }), tx({ id: 'b', amount: 1e9 }),
      tx({ id: 'c', date: '1900-01-01' }), tx({ id: 'd', date: '2100-12-31' }),
      tx({ id: 'e'.repeat(64) }),
    ]);
    expect(out).toHaveLength(5);
  });

  it('truncates over-long text instead of rejecting the record', () => {
    const [t] = sanitizeTransactions([tx({ notes: 'n'.repeat(500), category: 'c'.repeat(100) })]);
    expect(t.notes).toHaveLength(200);
    expect(t.category).toHaveLength(40);
  });

  it('replaces missing or non-string notes with an empty string', () => {
    expect(sanitizeTransactions([tx({ notes: undefined })])[0].notes).toBe('');
    expect(sanitizeTransactions([tx({ notes: 42 })])[0].notes).toBe('');
  });

  it('removes duplicate ids (keeps the first), which would otherwise break edit/delete', () => {
    const out = sanitizeTransactions([tx({ amount: 1 }), tx({ amount: 2 })]);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(1);
  });

  it('drops unknown extra fields', () => {
    expect(Object.keys(sanitizeTransactions([tx({ evil: '<script>', __proto__: { x: 1 } })])[0]).sort()).toEqual(
      ['amount', 'category', 'date', 'id', 'notes', 'type']
    );
  });

  it('accepts an id called __proto__ without polluting anything', () => {
    const out = sanitizeTransactions([tx({ id: '__proto__' })]);
    expect(out).toHaveLength(1);
    expect({}.amount).toBeUndefined();
  });
});

describe('sanitizeBudgets', () => {
  it('keeps only real expense categories with a valid positive limit', () => {
    expect(sanitizeBudgets({ Food: 300, Bills: 0.01, Nonsense: 5, Housing: -1, Health: 0, Other: 'x', Education: 1e9 + 1 })).toEqual({
      Food: 300,
      Bills: 0.01,
    });
  });

  it('rejects non-objects and survives a hostile __proto__ key', () => {
    [null, undefined, [], 'x', 5].forEach((v) => expect(sanitizeBudgets(v)).toBeUndefined());
    const hostile = JSON.parse('{"__proto__":{"polluted":1},"Food":100}');
    const out = sanitizeBudgets(hostile);
    expect(out).toEqual({ Food: 100 });
    expect({}.polluted).toBeUndefined();
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });
});

describe('sanitizeSubscriptions', () => {
  it('keeps valid records, filling a missing anchorDay from the due date', () => {
    expect(sanitizeSubscriptions([sub()])).toEqual([sub()]);
    expect(sanitizeSubscriptions([sub({ anchorDay: undefined, nextDue: '2026-01-31' })])[0].anchorDay).toBe(31);
    expect(sanitizeSubscriptions([sub({ anchorDay: 99 })])[0].anchorDay).toBe(20);
  });

  it('drops invalid records', () => {
    const bad = [
      null, {}, sub({ id: '' }), sub({ id: 'a b' }), sub({ name: '' }), sub({ name: '  ' }),
      sub({ cost: 0 }), sub({ cost: -3 }), sub({ cost: 1e9 + 1 }),
      sub({ cycle: 'daily' }), sub({ cycle: 'hourly' }), sub({ nextDue: '2026-02-30' }),
    ];
    expect(sanitizeSubscriptions([...bad, sub({ id: 'ok' })]).map((s) => s.id)).toEqual(['ok']);
  });

  it('cleans an invalid lastPaid to empty, truncates the name, dedupes ids', () => {
    expect(sanitizeSubscriptions([sub({ lastPaid: 'nope' })])[0].lastPaid).toBe('');
    expect(sanitizeSubscriptions([sub({ name: 'n'.repeat(100) })])[0].name).toHaveLength(60);
    expect(sanitizeSubscriptions([sub({ cost: 1 }), sub({ cost: 2 })])).toHaveLength(1);
  });
});

describe('sanitizeTab', () => {
  it('accepts only the known tab ids', () => {
    ['dashboard', 'transactions', 'budgets', 'subscriptions', 'calculator'].forEach((t) => expect(sanitizeTab(t)).toBe(t));
    ['settings', '', null, 5, 'DASHBOARD'].forEach((t) => expect(sanitizeTab(t)).toBeUndefined());
  });
});
