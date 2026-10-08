import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRawDump, buildRescueBackup, resetLocalData } from '../src/utils/rescue';
import { parseBackup } from '../src/utils/backup';

const tx = (id, o = {}) => ({ id, type: 'expense', amount: 12.5, category: 'Food', date: '2026-10-08', notes: 'x', ...o });
const sub = { id: 's', name: 'Netflix', cost: 9.99, cycle: 'monthly', nextDue: '2026-10-20', lastPaid: '', anchorDay: 20 };
const L = window.localStorage;
const put = (k, v) => L.setItem(`expense-planner:${k}`, typeof v === 'string' ? v : JSON.stringify(v));
const get = (k) => L.getItem(`expense-planner:${k}`);

const blockStorage = () => {
  const deny = () => { throw new Error('denied'); };
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(deny);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(deny);
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(deny);
  vi.spyOn(Storage.prototype, 'key').mockImplementation(deny);
};

describe('buildRescueBackup (what the crash screen offers to download)', () => {
  it('healthy data gives a normal backup that Settings > Import accepts', () => {
    put('transactions', [tx('a'), tx('b', { type: 'income', category: 'Salary', amount: 100 })]);
    put('budgets', { Food: 300 });
    put('subscriptions', [sub]);
    const backup = buildRescueBackup();
    expect(backup.app).toBe('expense-planner');
    expect(backup.data.transactions).toHaveLength(2);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.error).toBeUndefined();
    expect(parsed.skipped).toBe(0);
  });

  it('corrupt JSON in one section: no throw, that section is empty, others survive, raw text kept', () => {
    put('transactions', '{{definitely not json');
    put('budgets', { Food: 300 });
    put('subscriptions', [sub]);
    const backup = buildRescueBackup();
    expect(backup.data.transactions).toEqual([]);
    expect(backup.data.budgets.Food).toBe(300);
    expect(backup.data.subscriptions).toHaveLength(1);
    expect(get('transactions:corrupt-backup')).toBe('{{definitely not json');
  });

  it('mixed good and bad records: only valid ones are exported, the original is kept', () => {
    const mixed = [tx('good'), tx('neg', { amount: -5 }), { nonsense: true }, null, tx('baddate', { date: '2026-02-31' })];
    put('transactions', mixed);
    expect(buildRescueBackup().data.transactions.map((t) => t.id)).toEqual(['good']);
    expect(JSON.parse(get('transactions:corrupt-backup'))).toHaveLength(5);
  });

  it('blocked storage: no throw, an empty but valid backup', () => {
    blockStorage();
    let backup;
    expect(() => { backup = buildRescueBackup(); }).not.toThrow();
    expect(backup.data.transactions).toEqual([]);
    expect(buildRawDump().keys).toEqual({});
  });
});

describe('buildRawDump', () => {
  it('contains the app keys byte for byte, even corrupt ones', () => {
    put('transactions', '{{corrupt');
    expect(buildRawDump().keys['expense-planner:transactions']).toBe('{{corrupt');
  });

  it("never contains the login token or other sites' keys", () => {
    put('transactions', []);
    L.setItem('sb-ref-auth-token', JSON.stringify({ access_token: 'SECRET-TOKEN' }));
    L.setItem('some-other-key', 'nope');
    const dump = buildRawDump();
    const text = JSON.stringify(dump);
    expect(text).not.toContain('SECRET-TOKEN');
    expect(text).not.toContain('some-other-key');
    expect(Object.keys(dump.keys).every((k) => k.startsWith('expense-planner:'))).toBe(true);
  });
});

describe('resetLocalData ("Start fresh" on the crash screen)', () => {
  let events;
  let lastBlob;
  beforeEach(() => {
    events = [];
    lastBlob = null;
    URL.createObjectURL = vi.fn((blob) => { lastBlob = blob; events.push('blob'); return 'blob:test'; });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      events.push(`download:${this.download}`);
    });
  });

  const seed = () => {
    put('transactions', [tx('a', { notes: 'keep me' })]);
    put('budgets', { Food: 300 });
    put('subscriptions', '[]');
    put('tab', '"budgets"');
    put('sync', { userId: 'u', cursors: {}, snapshot: { transactions: { a: 'x' } } });
    put('pre-import-backup', 'OLD-SAFETY-COPY');
    put('budgets:corrupt-backup', 'OLD-CORRUPT');
    L.setItem('sb-ref-auth-token', JSON.stringify({ access_token: 'LOGIN' }));
    L.setItem('other-site', 'untouched');
  };

  it('downloads the backup first, then clears only the data keys', () => {
    seed();
    resetLocalData();
    expect(events.indexOf('blob')).toBe(0);
    expect(events.some((e) => e.startsWith('download:pocket-book-rescue-'))).toBe(true);
    ['transactions', 'budgets', 'subscriptions', 'tab', 'sync'].forEach((k) => expect(get(k)).toBeNull());
  });

  it('keeps a raw copy in the browser that never includes the login token', () => {
    seed();
    const before = get('transactions');
    resetLocalData();
    const crash = JSON.parse(get('crash-backup'));
    expect(crash.keys['expense-planner:transactions']).toBe(before);
    expect(JSON.stringify(crash)).not.toContain('LOGIN');
  });

  it('leaves earlier backups, the login session and other sites alone', () => {
    seed();
    resetLocalData();
    expect(get('pre-import-backup')).toBe('OLD-SAFETY-COPY');
    expect(get('budgets:corrupt-backup')).toBe('OLD-CORRUPT');
    expect(L.getItem('sb-ref-auth-token')).toContain('LOGIN');
    expect(L.getItem('other-site')).toBe('untouched');
  });

  it('the downloaded file is a valid backup holding the data that was cleared', async () => {
    put('transactions', [tx('z', { type: 'income', category: 'Salary', amount: 9 })]);
    put('budgets', { Bills: 50 });
    resetLocalData();
    const text = await new Promise((resolve) => {
      const reader = new FileReader(); // jsdom's Blob has no .text()
      reader.onload = () => resolve(reader.result);
      reader.readAsText(lastBlob);
    });
    const file = JSON.parse(text);
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.error).toBeUndefined();
    expect(file.data.transactions[0].id).toBe('z');
    expect(file.data.budgets.Bills).toBe(50);
  });

  it('corrupt data: does not throw and keeps the raw text', () => {
    put('transactions', '{{corrupt');
    expect(() => resetLocalData()).not.toThrow();
    expect(JSON.parse(get('crash-backup')).keys['expense-planner:transactions']).toBe('{{corrupt');
  });

  it('blocked storage: does not throw', () => {
    blockStorage();
    expect(() => resetLocalData()).not.toThrow();
  });
});
