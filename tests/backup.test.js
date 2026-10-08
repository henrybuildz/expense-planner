import { describe, expect, it } from 'vitest';
import { BACKUP_VERSION, buildBackup, parseBackup } from '../src/utils/backup';

const tx = (over = {}) => ({ id: 'a', type: 'expense', amount: 12.5, category: 'Food', date: '2026-10-08', notes: 'x', ...over });
const sub = { id: 's1', name: 'Netflix', cost: 9.99, cycle: 'monthly', nextDue: '2026-10-20', lastPaid: '', anchorDay: 20 };
const data = { transactions: [tx(), tx({ id: 'b', type: 'income', category: 'Salary', amount: 100 })], budgets: { Food: 300 }, subscriptions: [sub] };

describe('buildBackup / parseBackup round trip', () => {
  it('writes the documented format', () => {
    const b = buildBackup(data, new Date('2026-10-08T12:00:00Z'));
    expect(b).toMatchObject({ app: 'expense-planner', version: BACKUP_VERSION, currency: 'EUR', exportedAt: '2026-10-08T12:00:00.000Z' });
    expect(b.data).toEqual(data);
  });

  it('survives a round trip exactly', () => {
    const parsed = parseBackup(JSON.stringify(buildBackup(data)));
    expect(parsed.error).toBeUndefined();
    expect(parsed.data).toEqual(data);
    expect(parsed.skipped).toBe(0);
    expect(parsed.currencyNote).toBe('');
  });

  it('only returns the sections present in the file', () => {
    const file = { ...buildBackup(data), data: { transactions: data.transactions } };
    const parsed = parseBackup(JSON.stringify(file));
    expect(Object.keys(parsed.data)).toEqual(['transactions']);
  });
});

describe('parseBackup rejects bad files without throwing', () => {
  const err = (text) => parseBackup(text).error;

  it('rejects non-JSON, wrong app, wrong shape', () => {
    expect(err('hello')).toMatch(/not valid JSON/i);
    expect(err('')).toBeTruthy();
    expect(err('null')).toMatch(/not a Pocket Book backup/i);
    expect(err('[1,2,3]')).toMatch(/not a Pocket Book backup/i);
    expect(err('{"app":"other","version":1,"data":{}}')).toMatch(/not a Pocket Book backup/i);
  });

  it('rejects unknown or future versions and missing data', () => {
    expect(err(JSON.stringify({ ...buildBackup(data), version: 99 }))).toMatch(/newer version/i);
    expect(err(JSON.stringify({ ...buildBackup(data), version: 0 }))).toMatch(/newer version|cannot be read/i);
    expect(err(JSON.stringify({ ...buildBackup(data), version: '1' }))).toBeTruthy();
    expect(err('{"app":"expense-planner","version":1}')).toMatch(/no data section/i);
    expect(err('{"app":"expense-planner","version":1,"data":{}}')).toMatch(/no data/i);
  });

  it('rejects a damaged section', () => {
    expect(err(JSON.stringify({ ...buildBackup(data), data: { transactions: 'nope' } }))).toMatch(/"transactions" section/);
    expect(err(JSON.stringify({ ...buildBackup(data), data: { budgets: [] } }))).toMatch(/"budgets" section/);
  });
});

describe('parseBackup treats the file as hostile', () => {
  it('skips and counts invalid records, trims long text, blocks prototype pollution', () => {
    const hostile = {
      app: 'expense-planner',
      version: 1,
      data: {
        transactions: [tx({ id: 'ok' }), tx({ id: 'ok' }), tx({ id: 'neg', amount: -5 }), tx({ id: 'big', amount: 1e15 }), tx({ id: 'd', date: '2026-02-31' }), tx({ id: 'long', notes: 'n'.repeat(5000) }), null, 5],
        budgets: JSON.parse('{"__proto__":{"x":1},"Food":100,"Nonsense":5,"Bills":-1}'),
        subscriptions: [{ ...sub, name: '<img src=x onerror=alert(1)>', cycle: 'daily' }],
      },
    };
    const parsed = parseBackup(JSON.stringify(hostile));
    expect(parsed.data.transactions.map((t) => t.id)).toEqual(['ok', 'long']);
    expect(parsed.data.transactions[1].notes).toHaveLength(200);
    expect(parsed.data.budgets).toEqual({ Food: 100 });
    expect(parsed.data.subscriptions).toEqual([]);
    expect({}.x).toBeUndefined();
    expect(parsed.skipped).toBe(6 + 3 + 1); // 8 tx records -> 2 kept, 4 budget keys -> 1 kept, 1 sub -> 0 kept
  });

  it('warns when the backup was made in another currency', () => {
    const parsed = parseBackup(JSON.stringify({ ...buildBackup(data), currency: 'USD' }));
    expect(parsed.error).toBeUndefined();
    expect(parsed.currencyNote).toMatch(/USD.*not converted/i);
  });
});
