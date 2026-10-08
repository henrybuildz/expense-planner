// The real SyncProvider, with a fake Supabase: when does `loadingAccountData` turn on and, more
// importantly, when does it turn OFF again.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ gate: null, session: null, failSelect: false, authCb: null }));

vi.mock('../../src/lib/supabase', () => ({
  syncEnabled: true,
  urlAuthError: '',
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: h.session } }),
      onAuthStateChange: (cb) => { h.authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
      signOut: () => Promise.resolve({}),
      signInWithOAuth: () => Promise.resolve({}),
    },
    from() {
      const q = {};
      ['select', 'gte', 'order', 'range', 'update', 'in', 'upsert'].forEach((m) => { q[m] = () => q; });
      q.then = (res, rej) =>
        (h.failSelect
          ? Promise.resolve({ data: null, error: { message: 'down' } })
          : h.gate.then(() => ({ data: [], error: null }))
        ).then(res, rej);
      return q;
    },
  },
}));

const { AppProvider } = await import('../../src/context/AppContext');
const { UndoProvider } = await import('../../src/context/UndoContext');
const { SyncProvider, useSync, useAccountLoading } = await import('../../src/context/SyncContext');
const { default: AccountSync } = await import('../../src/components/account/AccountSync');

function Probe() {
  const s = useSync();
  return <p data-testid="p">{String(s.loadingAccountData)}|{s.status}|{s.authReady ? 'ready' : 'checking'}</p>;
}
const mount = () =>
  render(<AppProvider><UndoProvider><SyncProvider><Probe /></SyncProvider></UndoProvider></AppProvider>);
const text = () => screen.getByTestId('p').textContent;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  vi.useFakeTimers();
  h.failSelect = false;
  h.session = { user: { id: 'U1' } };
  h.gate = new Promise((resolve) => { h.release = resolve; });
});
afterEach(() => vi.useRealTimers());

describe('loadingAccountData', () => {
  it('is false for a signed-out visitor (no placeholders, ever)', async () => {
    h.session = null;
    mount();
    await flush();
    expect(text()).toBe('false|idle|ready');
  });

  it('is true while a signed-in device waits for its first sync, and false once it lands', async () => {
    mount();
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(text()).toMatch(/^true\|syncing/);
    await act(async () => { h.release(); await vi.advanceTimersByTimeAsync(10); });
    expect(text()).toBe('false|idle|ready');
  });

  it('turns off when the first sync FAILS (no endless placeholders offline or on errors)', async () => {
    h.failSelect = true;
    mount();
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(text()).toMatch(/^false\|(error|offline)/);
  });

  it('gives up after 15 s if the request hangs', async () => {
    mount();
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(text()).toMatch(/^true/);
    await act(async () => { await vi.advanceTimersByTimeAsync(14000); });
    expect(text()).toMatch(/^true/);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(text()).toMatch(/^false\|syncing/);
  });
});

describe('account card while the saved login is being checked', () => {
  it('shows a placeholder (not nothing), then the real card', async () => {
    let finish;
    h.session = null;
    const original = (await import('../../src/lib/supabase')).supabase.auth.getSession;
    (await import('../../src/lib/supabase')).supabase.auth.getSession = () => new Promise((r) => { finish = () => r({ data: { session: null } }); });
    render(<AppProvider><UndoProvider><SyncProvider><AccountSync /></SyncProvider></UndoProvider></AppProvider>);
    expect(screen.getByRole('status')).toHaveTextContent(/checking your account/i);
    expect(screen.queryByText(/sign in with google/i)).not.toBeInTheDocument();
    await act(async () => { finish(); await Promise.resolve(); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    (await import('../../src/lib/supabase')).supabase.auth.getSession = original;
  });
});

describe('switching accounts without a reload', () => {
  it('placeholders come back for the new account\'s first sync', async () => {
    mount();
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    await act(async () => { h.release(); await vi.advanceTimersByTimeAsync(10); });
    expect(text()).toBe('false|idle|ready');
    // sign out, then a different person signs in on the same page; their first sync is slow
    h.gate = new Promise((resolve) => { h.release = resolve; });
    await act(async () => { h.authCb('SIGNED_OUT', null); await vi.advanceTimersByTimeAsync(10); });
    await act(async () => { h.authCb('SIGNED_IN', { user: { id: 'U2' } }); await vi.advanceTimersByTimeAsync(10); });
    expect(text()).toMatch(/^true/);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(text()).toMatch(/^true\|syncing/); // really syncing, and still showing placeholders
    await act(async () => { h.release(); await vi.advanceTimersByTimeAsync(10); });
    expect(text()).toMatch(/^false/);
  });
});

describe('re-render cost', () => {
  it('a screen using useAccountLoading does NOT re-render on background syncs; useSync does', async () => {
    let cheap = 0;
    let costly = 0;
    let api;
    const Cheap = () => { useAccountLoading(); cheap += 1; return null; };
    const Costly = () => { useSync(); costly += 1; return null; };
    const Grab = () => { api = useSync(); return null; };
    render(<AppProvider><UndoProvider><SyncProvider><Grab /><Cheap /><Costly /></SyncProvider></UndoProvider></AppProvider>);
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    await act(async () => { h.release(); await vi.advanceTimersByTimeAsync(10); });
    const [c0, k0] = [cheap, costly];
    for (let i = 0; i < 3; i += 1) {
      await act(async () => { api.syncNow(); await vi.advanceTimersByTimeAsync(10); });
    }
    expect(cheap).toBe(c0);
    expect(costly).toBeGreaterThan(k0);
  });
});
