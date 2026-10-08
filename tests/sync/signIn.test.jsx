import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fake supabase client: only the auth calls the provider makes.
const signInWithOAuth = vi.fn(async () => ({ error: null }));
const signOut = vi.fn(async () => ({ error: null }));
vi.mock('../../src/lib/supabase', () => ({
  syncEnabled: true,
  urlAuthError: '',
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOAuth,
      signOut,
    },
  },
}));

const { AppProvider } = await import('../../src/context/AppContext');
const { UndoProvider } = await import('../../src/context/UndoContext');
const { SyncProvider, useSync } = await import('../../src/context/SyncContext');

const wrapper = ({ children }) => (
  <AppProvider>
    <UndoProvider>
      <SyncProvider>{children}</SyncProvider>
    </UndoProvider>
  </AppProvider>
);

beforeEach(() => vi.clearAllMocks());

describe('Google sign-in', () => {
  it('always asks Google for the account chooser (otherwise it silently signs the same account back in)', async () => {
    const { result } = renderHook(() => useSync(), { wrapper });
    await act(async () => { await result.current.signIn(); });
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    const arg = signInWithOAuth.mock.calls[0][0];
    expect(arg.provider).toBe('google');
    expect(arg.options.queryParams).toEqual({ prompt: 'select_account' });
  });

  it('there is only one sign-out: it keeps the data on the device', async () => {
    const { result } = renderHook(() => useSync(), { wrapper });
    expect(result.current.signOutAndWipe).toBeUndefined();
    await act(async () => { await result.current.signOut(); });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('"Delete all data" while signed out never carries over to the account on the next sign-in', async () => {
    // This device last synced as u1 with 5 records, then the user signed out.
    localStorage.setItem(
      'expense-planner:sync',
      JSON.stringify({ userId: 'u1', cursors: { transactions: '2026-10-01T00:00:00Z' }, snapshot: { transactions: { a: 'x', b: 'x', c: 'x', d: 'x', e: 'x' } } })
    );
    const { result } = renderHook(() => useSync(), { wrapper });
    act(() => result.current.permitMassDelete()); // what Delete all data calls first
    const meta = JSON.parse(localStorage.getItem('expense-planner:sync'));
    expect(meta.userId).toBeNull(); // forgotten: signing in again merges instead of deleting
    expect(meta.snapshot).toEqual({});
  });
});
