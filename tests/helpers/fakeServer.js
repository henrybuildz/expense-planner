// A fake Supabase backend + "devices" for sync tests. It mimics what matters about the real database:
// server-stamped updated_at (one timestamp per write), soft deletes, row-level security by user id,
// ordering and paging, and injectable failures.
import { runSync } from '../../src/sync/engine';
import { createRemote } from '../../src/sync/remote';
import { loadMeta } from '../../src/sync/meta';
import { TABLES, TABLE_NAMES } from '../../src/sync/tables';

export class Server {
  constructor() {
    this.t = Object.fromEntries(TABLE_NAMES.map((n) => [n, new Map()]));
    this.clock = 0;
    this.calls = { upsert: 0, softDelete: 0, select: 0 };
    this.failOn = null; // e.g. 'budgets:upsert'
  }

  stamp() {
    this.clock += 1;
    const mm = String(Math.floor(this.clock / 60)).padStart(2, '0');
    const ss = String(this.clock % 60).padStart(2, '0');
    return `2026-10-08T12:${mm}:${ss}.000000+00:00`;
  }

  /** Put a row straight into the database (e.g. malformed or back-dated rows). */
  insertRaw(name, row, at) {
    this.t[name].set(row[TABLES[name].key], { deleted_at: null, ...row, updated_at: at ?? this.stamp() });
  }

  live(name) {
    return [...this.t[name].values()].filter((r) => !r.deleted_at);
  }
}

/** The subset of supabase-js that remote.js uses, backed by the fake server. */
export function fakeClient(server, userId) {
  return {
    from(name) {
      const q = { orders: [], op: 'select' };
      q.select = () => q;
      q.gte = (c, v) => { q.cursor = v; return q; };
      q.order = (c) => { q.orders.push(c); return q; };
      q.range = (a, b) => { q.a = a; q.b = b; return q; };
      q.update = (patch) => { q.op = 'update'; q.patch = patch; return q; };
      q.in = (c, vals) => { q.vals = vals; return q; };
      q.upsert = (rows, opts) => { q.op = 'upsert'; q.rows = rows; q.opts = opts; return q; };
      q.then = (res, rej) =>
        Promise.resolve()
          .then(() => {
            if (server.failOn === `${name}:${q.op}`) return { error: { message: `boom ${q.op}` } };
            const map = server.t[name];
            const table = TABLES[name];
            if (q.op === 'upsert') {
              server.calls.upsert += 1;
              const at = server.stamp();
              for (const r of q.rows) {
                if (r.user_id !== userId) return { error: { message: 'RLS' } };
                map.set(r[table.key], { ...r, updated_at: at });
              }
              return { error: null };
            }
            if (q.op === 'update') {
              server.calls.softDelete += 1;
              const at = server.stamp();
              for (const k of q.vals) if (map.has(k)) map.set(k, { ...map.get(k), ...q.patch, updated_at: at });
              return { error: null };
            }
            server.calls.select += 1;
            const rows = [...map.values()].filter((r) => !q.cursor || Date.parse(r.updated_at) >= Date.parse(q.cursor));
            rows.sort((x, y) =>
              x.updated_at < y.updated_at ? -1 : x.updated_at > y.updated_at ? 1 : x[table.key] < y[table.key] ? -1 : 1
            );
            return { data: rows.slice(q.a, q.b + 1), error: null };
          })
          .then(res, rej);
      return q;
    },
  };
}

/** One browser: its own data and its own sync bookkeeping. */
export function device(server, userId = 'U1') {
  const state = { transactions: [], budgets: {}, subscriptions: [] };
  const mem = {};
  const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  const d = {
    state,
    server,
    storage,
    meta: loadMeta(storage),
    store: { get: (n) => state[n], update: (n, fn) => { state[n] = fn(state[n]); } },
    remote: createRemote(fakeClient(server, userId)),
    sync: (opts = {}) => runSync({ remote: d.remote, userId, store: d.store, meta: d.meta, ...opts }),
    ids: () => state.transactions.map((t) => t.id).sort(),
    edit: (id, patch) => { state.transactions = state.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)); },
  };
  return d;
}

export const tx = (id, amount = 10, extra = {}) => ({ id, type: 'expense', amount, category: 'Food', date: '2026-10-08', notes: '', ...extra });
export const sub = (id) => ({ id, name: 'Netflix', cost: 9.99, cycle: 'monthly', nextDue: '2026-10-20', lastPaid: '', anchorDay: 20 });
export const rawTx = (id, over = {}) => ({ user_id: 'U1', id, type: 'expense', amount: '1.00', category: 'Food', date: '2026-10-08', notes: '', ...over });
