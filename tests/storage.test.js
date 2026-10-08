import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { STORAGE_ERROR_EVENT, hasStorageFailed, readStorage, useLocalStorage } from '../src/hooks/useLocalStorage';
import { sanitizeTransactions } from '../src/utils/sanitize';

const KEY = 'expense-planner:transactions';
const good = { id: 'a', type: 'expense', amount: 5, category: 'Food', date: '2026-10-08', notes: '' };
const EMPTY = [];

describe('readStorage', () => {
  it('returns the fallback when the key is missing', () => {
    expect(readStorage(KEY, EMPTY, sanitizeTransactions)).toBe(EMPTY);
  });

  it('returns valid data as-is without making a backup', () => {
    localStorage.setItem(KEY, JSON.stringify([good]));
    expect(readStorage(KEY, EMPTY, sanitizeTransactions)).toEqual([good]);
    expect(localStorage.getItem(`${KEY}:corrupt-backup`)).toBeNull();
  });

  it('unparseable JSON: fallback, raw text preserved', () => {
    localStorage.setItem(KEY, '{{oops');
    expect(readStorage(KEY, EMPTY, sanitizeTransactions)).toBe(EMPTY);
    expect(localStorage.getItem(`${KEY}:corrupt-backup`)).toBe('{{oops');
  });

  it('wrong shape: fallback, raw text preserved', () => {
    localStorage.setItem(KEY, '{"not":"an array"}');
    expect(readStorage(KEY, EMPTY, sanitizeTransactions)).toBe(EMPTY);
    expect(localStorage.getItem(`${KEY}:corrupt-backup`)).toBe('{"not":"an array"}');
  });

  it('partly invalid records: keeps the good ones and backs up the original before they are dropped', () => {
    const raw = JSON.stringify([good, { ...good, id: 'bad', amount: -1 }]);
    localStorage.setItem(KEY, raw);
    expect(readStorage(KEY, EMPTY, sanitizeTransactions)).toEqual([good]);
    expect(localStorage.getItem(`${KEY}:corrupt-backup`)).toBe(raw);
  });

  it('blocked storage: fallback, no throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readStorage(KEY, EMPTY, sanitizeTransactions)).toBe(EMPTY);
  });
});

describe('useLocalStorage', () => {
  it('persists updates', () => {
    const { result } = renderHook(() => useLocalStorage(KEY, EMPTY, sanitizeTransactions));
    act(() => result.current[1]([good]));
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual([good]);
  });

  it('follows changes made in another tab', () => {
    const { result } = renderHook(() => useLocalStorage(KEY, EMPTY, sanitizeTransactions));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: JSON.stringify([good]) }));
    });
    expect(result.current[0]).toEqual([good]);
  });

  it('resets to the initial value when another tab removes the key', () => {
    localStorage.setItem(KEY, JSON.stringify([good]));
    const { result } = renderHook(() => useLocalStorage(KEY, EMPTY, sanitizeTransactions));
    expect(result.current[0]).toEqual([good]);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: null }));
    });
    expect(result.current[0]).toBe(EMPTY);
  });

  it('ignores malformed or invalid writes from another tab, and other keys', () => {
    const { result } = renderHook(() => useLocalStorage(KEY, EMPTY, sanitizeTransactions));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: '{{bad' }));
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: '"string"' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: JSON.stringify([good]) }));
    });
    expect(result.current[0]).toBe(EMPTY);
  });

  it('a full or blocked disk keeps working in memory and raises the warning event', () => {
    const onError = vi.fn();
    window.addEventListener(STORAGE_ERROR_EVENT, onError);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const { result } = renderHook(() => useLocalStorage(KEY, EMPTY, sanitizeTransactions));
    act(() => result.current[1]([good]));
    expect(result.current[0]).toEqual([good]);
    expect(onError).toHaveBeenCalled();
    expect(hasStorageFailed()).toBe(true);
    window.removeEventListener(STORAGE_ERROR_EVENT, onError);
  });
});
