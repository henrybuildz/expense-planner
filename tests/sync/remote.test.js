// remote.js against the REAL supabase-js client, with fetch replaced by a recorder.
// The engine tests use a hand-written fake client; this proves the fake matches what actually goes on the wire.
import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRemote } from '../../src/sync/remote';
import { TABLES } from '../../src/sync/tables';

let calls;
let respond;

let shared;
const remote = () => {
  if (shared) return shared;
  const client = createClient('https://example.supabase.co', 'sb_publishable_test', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (url, init = {}) => {
        const u = new URL(url);
        calls.push({ method: init.method || 'GET', path: u.pathname, q: u.searchParams, headers: new Headers(init.headers), body: init.body ? JSON.parse(init.body) : null });
        const { status = 200, body = [] } = respond(calls[calls.length - 1]);
        return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      },
    },
  });
  shared = createRemote(client);
  return shared;
};

beforeEach(() => {
  calls = [];
  respond = () => ({ body: [] });
});

describe('upsert', () => {
  it('POSTs to the right table with on_conflict and merge-duplicates', async () => {
    const rows = [TABLES.transactions.toRow({ id: 'a', type: 'expense', amount: 1, category: 'Food', date: '2026-10-08', notes: '' }, 'U1')];
    await remote().upsert(TABLES.transactions, rows);
    expect(calls).toHaveLength(1);
    const c = calls[0];
    expect(c.method).toBe('POST');
    expect(c.path).toBe('/rest/v1/transactions');
    expect(c.q.get('on_conflict')).toBe('user_id,id');
    expect(c.headers.get('prefer')).toContain('resolution=merge-duplicates');
    expect(c.body).toEqual(rows);
    expect(c.body[0].deleted_at).toBeNull(); // an upsert un-deletes
  });

  it('uses the budget conflict key and snake_case columns', async () => {
    await remote().upsert(TABLES.budgets, [TABLES.budgets.toRow({ category: 'Food', limit: 5 }, 'U1')]);
    expect(calls[0].q.get('on_conflict')).toBe('user_id,category');
    expect(calls[0].body[0]).toEqual({ user_id: 'U1', category: 'Food', monthly_limit: 5, deleted_at: null });
  });

  it('splits big batches into chunks of 500', async () => {
    const rows = Array.from({ length: 1201 }, (_, i) => ({ user_id: 'U1', id: `r${i}` }));
    await remote().upsert(TABLES.transactions, rows);
    expect(calls.map((c) => c.body.length)).toEqual([500, 500, 201]);
  });

  it('throws the server error so the sync reports a failure', async () => {
    respond = () => ({ status: 403, body: { message: 'new row violates row-level security policy', code: '42501' } });
    await expect(remote().upsert(TABLES.transactions, [{ user_id: 'x', id: 'a' }])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('softDelete', () => {
  it('PATCHes deleted_at for exactly those keys, in small URL-safe chunks', async () => {
    const keys = Array.from({ length: 120 }, (_, i) => `id${i}`);
    await remote().softDelete(TABLES.transactions, keys);
    expect(calls.map((c) => c.method)).toEqual(['PATCH', 'PATCH', 'PATCH']);
    expect(calls[0].path).toBe('/rest/v1/transactions');
    expect(calls[0].q.get('id')).toBe('in.(id0,id1,id2,id3,id4,id5,id6,id7,id8,id9,id10,id11,id12,id13,id14,id15,id16,id17,id18,id19,id20,id21,id22,id23,id24,id25,id26,id27,id28,id29,id30,id31,id32,id33,id34,id35,id36,id37,id38,id39,id40,id41,id42,id43,id44,id45,id46,id47,id48,id49)');
    expect(calls[0].body).toEqual({ deleted_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) });
    expect(Object.keys(calls[0].body)).toEqual(['deleted_at']); // nothing else is touched
    expect(calls.reduce((n, c) => n + c.q.get('id').split(',').length, 0)).toBe(120);
  });

  it('filters budgets by their category key', async () => {
    await remote().softDelete(TABLES.budgets, ['Food']);
    expect(calls[0].q.get('category')).toBe('in.(Food)');
  });

  it('ids with odd (but allowed) characters are encoded safely, not as extra filters', async () => {
    await remote().softDelete(TABLES.transactions, ['a.b', 'c-d_e']);
    expect(calls[0].q.get('id')).toBe('in.(a.b,c-d_e)');
    expect([...calls[0].q.keys()]).toEqual(['id']);
  });
});

describe('changedSince', () => {
  it('first sync: no cursor filter, stable two-column order, first page', async () => {
    await remote().changedSince(TABLES.transactions, null);
    const c = calls[0];
    expect(c.method).toBe('GET');
    expect(c.q.get('select')).toBe('*');
    expect(c.q.get('order')).toBe('updated_at.asc,id.asc');
    expect(c.q.has('updated_at')).toBe(false);
    expect([c.q.get('offset'), c.q.get('limit')]).toEqual(['0', '1000']);
  });

  it('later syncs: gte the cursor minus the 10 s look-back', async () => {
    await remote().changedSince(TABLES.transactions, '2026-10-08T12:00:30.000000+00:00');
    expect(calls[0].q.get('updated_at')).toBe('gte.2026-10-08T12:00:20.000Z');
  });

  it('keeps asking for pages until a short one arrives', async () => {
    const page = (n) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, updated_at: '2026-10-08T12:00:00+00:00' }));
    const sizes = [1000, 1000, 5];
    respond = () => ({ body: page(sizes.shift()) });
    const rows = await remote().changedSince(TABLES.transactions, null);
    expect(rows).toHaveLength(2005);
    expect(calls.map((c) => [c.q.get('offset'), c.q.get('limit')])).toEqual([['0', '1000'], ['1000', '1000'], ['2000', '1000']]);
  });

  it('an unparseable cursor is sent through unchanged instead of crashing', async () => {
    await remote().changedSince(TABLES.transactions, 'garbage');
    expect(calls[0].q.get('updated_at')).toBe('gte.garbage');
  });

  it('server errors surface', async () => {
    respond = () => ({ status: 500, body: { message: 'boom' } });
    await expect(remote().changedSince(TABLES.transactions, null)).rejects.toMatchObject({ message: 'boom' });
  });

  it('never sends the secret/service role: only the publishable key as apikey', async () => {
    await remote().changedSince(TABLES.transactions, null);
    expect(calls[0].headers.get('apikey')).toBe('sb_publishable_test');
  });
});
