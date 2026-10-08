import { describe, expect, it } from 'vitest';
import { MassDeleteError, applyRows, hasPendingChanges, isMassDelete } from '../../src/sync/engine';
import { loadMeta } from '../../src/sync/meta';
import { TABLES } from '../../src/sync/tables';
import { Server, device, rawTx, sub, tx } from '../helpers/fakeServer';

const setup = () => {
  const server = new Server();
  return { server, A: device(server), B: device(server) };
};

describe('basic replication', () => {
  it('pushes everything from A and B pulls it with the exact local shape', async () => {
    const { server, A, B } = setup();
    A.state.transactions.push(tx('t1', 12.5));
    A.state.budgets.Food = 300;
    A.state.subscriptions.push(sub('s1'));
    await A.sync();
    expect([server.t.transactions.size, server.t.budgets.size, server.t.subscriptions.size]).toEqual([1, 1, 1]);
    await B.sync();
    expect(B.ids()).toEqual(['t1']);
    expect(B.state.budgets.Food).toBe(300);
    expect(B.state.subscriptions[0]).toEqual(sub('s1'));
  });

  it('edits and deletes travel; deletes stay as tombstones on the server', async () => {
    const { server, A, B } = setup();
    A.state.transactions.push(tx('t1'));
    await A.sync(); await B.sync();
    B.edit('t1', { amount: 99 });
    await B.sync(); await A.sync();
    expect(A.state.transactions[0].amount).toBe(99);
    A.state.transactions = [];
    await A.sync();
    expect(server.t.transactions.get('t1').deleted_at).not.toBeNull();
    await B.sync();
    expect(B.ids()).toEqual([]);
  });

  it('merges offline adds from both devices (union, no duplicates)', async () => {
    const { A, B } = setup();
    A.state.transactions.push(tx('t2', 1));
    B.state.transactions.push(tx('t3', 2));
    await A.sync(); await B.sync(); await A.sync();
    expect(A.ids()).toEqual(['t2', 't3']);
    expect(B.ids()).toEqual(['t2', 't3']);
  });

  it('same-record conflict: the last device to sync wins and both converge', async () => {
    const { A, B } = setup();
    A.state.transactions.push(tx('t2', 1));
    await A.sync(); await B.sync();
    A.edit('t2', { amount: 111 });
    B.edit('t2', { amount: 222 });
    await A.sync(); await B.sync(); await A.sync();
    expect(A.state.transactions[0].amount).toBe(222);
    expect(B.state.transactions[0].amount).toBe(222);
  });

  it('delete vs edit on two devices converges', async () => {
    const { A: P, B: Q } = setup();
    P.state.transactions.push(tx('z1', 1));
    await P.sync(); await Q.sync();
    P.state.transactions = [];
    Q.edit('z1', { amount: 77 });
    await Q.sync(); await P.sync(); await Q.sync();
    expect(P.ids()).toEqual(Q.ids());
  });

  it('a first sign-in on a device that already has data merges with the account', async () => {
    const { server, A } = setup();
    A.state.transactions.push(tx('t2'));
    await A.sync();
    const C = device(server);
    C.state.transactions.push(tx('t9'));
    await C.sync();
    expect(C.ids()).toEqual(['t2', 't9']);
    expect(server.t.transactions.has('t9')).toBe(true);
  });

  it('re-created budgets come back (an upsert clears deleted_at)', async () => {
    const { server, A, B } = setup();
    A.state.budgets = { Food: 100 };
    await A.sync(); await B.sync();
    A.state.budgets = {};
    await A.sync(); await B.sync();
    expect(B.state.budgets).toEqual({});
    A.state.budgets = { Food: 500 };
    await A.sync(); await B.sync();
    expect(B.state.budgets.Food).toBe(500);
    expect(server.t.budgets.get('Food').deleted_at).toBeNull();
  });
});

describe('idle and failure behaviour', () => {
  it('an idle sync sends nothing and duplicates nothing', async () => {
    const { server, A } = setup();
    A.state.transactions.push(tx('a'), tx('b'));
    await A.sync();
    const before = { ...server.calls };
    await A.sync();
    expect(server.calls.upsert).toBe(before.upsert);
    expect(server.calls.softDelete).toBe(before.softDelete);
    expect(A.state.transactions).toHaveLength(2);
    expect(hasPendingChanges(A.meta, (n) => A.state[n])).toBe(false);
  });

  it('a failure part-way surfaces, and the retry resumes without resending confirmed work', async () => {
    const { server, A: F } = setup();
    F.state.transactions.push(tx('f1'));
    F.state.budgets.Bills = 50;
    server.failOn = 'budgets:upsert';
    await expect(F.sync()).rejects.toMatchObject({ message: 'boom upsert' });
    expect(server.t.transactions.has('f1')).toBe(true);
    expect(server.t.budgets.has('Bills')).toBe(false);
    server.failOn = null;
    const before = server.calls.upsert;
    await F.sync();
    expect(server.calls.upsert).toBe(before + 1); // only budgets
    expect(server.t.budgets.has('Bills')).toBe(true);
  });

  it('if the pull fails right after a successful push, the retry does not push the same records again', async () => {
    const { server, A } = setup();
    A.state.transactions.push(tx('p1'), tx('p2'));
    server.failOn = 'transactions:select';
    await expect(A.sync()).rejects.toMatchObject({ message: 'boom select' });
    expect(server.live('transactions')).toHaveLength(2);
    expect(Object.keys(A.meta.snapshot.transactions).sort()).toEqual(['p1', 'p2']); // push was remembered
    server.failOn = null;
    const before = server.calls.upsert;
    await A.sync();
    expect(server.calls.upsert).toBe(before + 0); // nothing re-sent for transactions
  });

  it('rows written under another user id are refused by the (fake) row-level security', async () => {
    const { server } = setup();
    const intruder = device(server, 'U2');
    intruder.state.transactions.push(tx('x'));
    await intruder.sync(); // U2 writing its own rows is fine
    const wrong = device(server, 'U1');
    wrong.remote = device(server, 'U2').remote; // client authenticated as U2 but rows stamped U1
    wrong.state.transactions.push(tx('y'));
    await expect(wrong.sync()).rejects.toMatchObject({ message: 'RLS' });
  });
});

describe('hostile or malformed server rows', () => {
  it('skips invalid rows, coerces numeric strings and null notes, and counts what it skipped', async () => {
    const { server, A } = setup();
    server.insertRaw('transactions', rawTx('good', { amount: '4.50', notes: null }));
    server.insertRaw('transactions', rawTx('neg', { amount: '-5' }));
    server.insertRaw('transactions', rawTx('baddate', { date: '1800-01-01' }));
    server.insertRaw('transactions', rawTx('wrongtype', { type: 'transfer' }));
    server.insertRaw('budgets', { user_id: 'U1', category: '__proto__', monthly_limit: '5' });
    server.insertRaw('budgets', { user_id: 'U1', category: 'NotACategory', monthly_limit: '5' });
    const report = await A.sync();
    expect(A.ids()).toEqual(['good']);
    expect(A.state.transactions[0]).toMatchObject({ amount: 4.5, notes: '' });
    expect(report.skipped).toBe(5);
    expect(Object.keys(A.state.budgets)).toEqual([]);
    expect({}.polluted).toBeUndefined();
  });

  it('a record id of "__proto__" syncs as an ordinary id', async () => {
    const { A, B } = setup();
    A.state.transactions.push(tx('__proto__', 3));
    await A.sync(); await B.sync();
    expect(B.ids()).toEqual(['__proto__']);
    expect({}.amount).toBeUndefined();
  });

  it('applyRows never mutates its input', () => {
    const list = Object.freeze([tx('a')]);
    const row = { id: 'b', type: 'expense', amount: 1, category: 'Food', date: '2026-10-08', notes: '', deleted_at: null };
    expect(() => applyRows(TABLES.transactions, list, [row])).not.toThrow();
    expect(list).toHaveLength(1);
  });
});

describe('paging and the cursor', () => {
  it('pulls 2500 rows that all share one timestamp (none skipped at page edges)', async () => {
    const { server, A } = setup();
    const at = '2026-10-08T12:00:00.000000+00:00';
    for (let i = 0; i < 2500; i += 1) server.insertRaw('transactions', rawTx(`r${String(i).padStart(4, '0')}`), at);
    await A.sync();
    expect(new Set(A.ids()).size).toBe(2500);
    expect(server.calls.select).toBeGreaterThanOrEqual(3);
  });

  it('catches a row another device committed late (older than our cursor, inside the 10 s look-back)', async () => {
    const { server, A: M, B: L } = setup();
    M.state.transactions.push(tx('m1'));
    await M.sync(); await L.sync();
    const behind = new Date(Date.parse(L.meta.cursors.transactions) - 3000).toISOString().replace('Z', '+00:00');
    server.insertRaw('transactions', rawTx('late1'), behind);
    await L.sync();
    expect(L.ids()).toEqual(['late1', 'm1']);
  });

  it('does not re-read rows older than the look-back window on every sync', async () => {
    const { server, A: M, B: L } = setup();
    M.state.transactions.push(tx('m1'));
    await M.sync(); await L.sync();
    const wayBehind = new Date(Date.parse(L.meta.cursors.transactions) - 60000).toISOString().replace('Z', '+00:00');
    server.insertRaw('transactions', rawTx('ancient'), wayBehind);
    await L.sync();
    expect(L.ids()).not.toContain('ancient');
  });
});

describe('bookkeeping (meta)', () => {
  it('survives a restart', async () => {
    const { A } = setup();
    A.state.transactions.push(tx('a'));
    await A.sync();
    const again = loadMeta(A.storage);
    expect(again.cursors.transactions).toBe(A.meta.cursors.transactions);
    expect(again.snapshot.transactions).toEqual(A.meta.snapshot.transactions);
  });

  it.each([
    ['not JSON', '{{not json'],
    ['wrong shapes', JSON.stringify({ userId: 5, cursors: [], snapshot: 'x' })],
    ['null', 'null'],
    ['array', '[]'],
  ])('treats %s as "never synced"', (_label, raw) => {
    const { A } = setup();
    A.storage.setItem('expense-planner:sync', raw);
    const m = loadMeta(A.storage);
    expect(m.userId).toBeNull();
    expect(m.cursors).toEqual({});
  });

  it('drops non-string fingerprints and cursors, and keeps "__proto__" as an ordinary key', () => {
    const { A } = setup();
    A.storage.setItem(
      'expense-planner:sync',
      '{"userId":"U1","cursors":{"transactions":5},"snapshot":{"transactions":{"a":"[1]","b":7,"__proto__":"x"}}}'
    );
    const m = loadMeta(A.storage);
    expect(m.cursors.transactions).toBeUndefined();
    expect(Object.keys(m.snapshot.transactions).sort()).toEqual(['__proto__', 'a']); // 'b' (a number) is dropped
    expect(Object.getPrototypeOf(m.snapshot.transactions)).toBeNull();
    expect({}.x).toBeUndefined();
  });

  it('save() does not throw when storage is full', () => {
    const { A } = setup();
    const m = loadMeta({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
    expect(() => m.save()).not.toThrow();
    expect(A).toBeTruthy();
  });
});

describe('mass-delete safety brake', () => {
  const seeded = async () => {
    const { server, A: V, B: W } = setup();
    for (let i = 0; i < 40; i += 1) V.state.transactions.push(tx(`v${String(i).padStart(2, '0')}`));
    await V.sync(); await W.sync();
    return { server, V, W };
  };

  it('threshold: 4 of 6 is allowed, 5 of 6 is not, 5 of 40 is allowed', () => {
    expect(isMassDelete(4, 6)).toBe(false);
    expect(isMassDelete(5, 6)).toBe(true);
    expect(isMassDelete(5, 40)).toBe(false);
    expect(isMassDelete(20, 40)).toBe(true);
    expect(isMassDelete(19, 40)).toBe(false);
  });

  it('stops when local data vanishes, and changes NOTHING on the server (not even unrelated edits)', async () => {
    const { server, V, W } = await seeded();
    V.state.transactions = [];
    V.state.budgets = { Food: 77 };
    const err = await V.sync().catch((e) => e);
    expect(err).toBeInstanceOf(MassDeleteError);
    expect(err.tables.transactions).toEqual({ deletes: 40, total: 40 });
    expect(server.live('transactions')).toHaveLength(40);
    expect(server.t.budgets.has('Food')).toBe(false);
    await W.sync();
    expect(W.ids()).toHaveLength(40);
  });

  it('"restore from account" (meta reset) brings the records back and keeps new work', async () => {
    const { server, V } = await seeded();
    V.state.transactions = [];
    V.state.budgets = { Food: 77 };
    await V.sync().catch(() => {});
    V.meta.reset('U1');
    await V.sync();
    expect(V.ids()).toHaveLength(40);
    expect(V.state.budgets.Food).toBe(77);
    expect(server.live('transactions')).toHaveLength(40);
  });

  it('explicit permission lets the deletes through and they reach other devices', async () => {
    const { server, V, W } = await seeded();
    V.state.transactions = [];
    await expect(V.sync()).rejects.toBeInstanceOf(MassDeleteError);
    await V.sync({ allowMassDelete: true });
    expect(server.live('transactions')).toHaveLength(0);
    await W.sync();
    expect(W.ids()).toEqual([]);
  });

  it('does not get in the way of normal use', async () => {
    const { server, A: N } = setup();
    for (let i = 0; i < 30; i += 1) N.state.transactions.push(tx(`n${i}`));
    await N.sync();
    N.state.transactions = N.state.transactions.slice(3);
    await N.sync();
    expect(server.live('transactions')).toHaveLength(27);
  });

  it('allows emptying a tiny dataset (fewer than 5 records)', async () => {
    const { server, A: Z } = setup();
    Z.state.transactions.push(tx('o1'), tx('o2'), tx('o3'));
    await Z.sync();
    Z.state.transactions = [];
    await Z.sync();
    expect(server.live('transactions')).toHaveLength(0);
  });
});

describe('telling the user another device deleted their data', () => {
  it('reports how many records another device removed, and that it was everything', async () => {
    const { A, B } = setup();
    A.state.transactions.push(tx('t1'), tx('t2'));
    A.state.budgets.Food = 100;
    await A.sync(); await B.sync();
    A.state.transactions = [];
    A.state.budgets = {};
    await A.sync({ allowMassDelete: true });
    const report = await B.sync();
    expect(report.removedHere).toBe(3);
    expect(report.removedHere).toBeGreaterThanOrEqual(report.held); // = "everything was deleted"
    expect(B.ids()).toEqual([]);
  });

  it('a partial delete reports fewer than held, and says nothing when nothing was removed', async () => {
    const { A, B } = setup();
    A.state.transactions.push(tx('t1'), tx('t2'), tx('t3'));
    await A.sync(); await B.sync();
    A.state.transactions = A.state.transactions.filter((t) => t.id !== 't1');
    await A.sync();
    const report = await B.sync();
    expect(report.removedHere).toBe(1);
    expect(report.held).toBeGreaterThan(report.removedHere);
    expect((await B.sync()).removedHere).toBe(0);
  });

  it('the device that did the deleting is never told about its own delete (its tombstones come back in the pull)', async () => {
    const { A, B } = setup();
    A.state.transactions.push(tx('t1'), tx('t2'));
    await A.sync(); await B.sync();
    A.state.transactions = [];
    const report = await A.sync({ allowMassDelete: true });
    expect(report.removedHere).toBe(0);
  });
});

describe('Undo after the delete already synced', () => {
  it('the restored records come back on every device with every field intact', async () => {
    const server = new Server();
    const UA = device(server);
    const UB = device(server);
    const keep = tx('keep1', 20);
    const gone = tx('undo1', 12.5, { notes: 'lunch' });
    const subKeep = sub('s-undo');
    UA.state.transactions.push(keep, gone);
    UA.state.subscriptions.push(subKeep);
    UA.state.budgets.Food = 250;
    await UA.sync(); await UB.sync();

    UA.state.transactions = UA.state.transactions.filter((t) => t.id !== 'undo1');
    UA.state.subscriptions = [];
    delete UA.state.budgets.Food;
    await UA.sync(); await UB.sync();
    expect(UB.ids()).not.toContain('undo1');

    UA.state.transactions = [gone, ...UA.state.transactions];
    UA.state.subscriptions = [subKeep];
    UA.state.budgets = { Food: 250 };
    await UA.sync(); await UB.sync();
    expect(server.t.transactions.get('undo1').deleted_at).toBeNull();
    expect(UB.state.transactions.find((t) => t.id === 'undo1')).toEqual(gone);
    expect(UB.state.subscriptions).toEqual([subKeep]);
    expect(UB.state.budgets.Food).toBe(250);
    expect(UA.ids()).toHaveLength(2);
    expect(UB.ids()).toHaveLength(2);
  });
});
