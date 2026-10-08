import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistenceStatus, persistenceSupported, requestPersistence } from '../src/utils/persist';

const original = Object.getOwnPropertyDescriptor(navigator, 'storage');
const setStorage = (value) => Object.defineProperty(navigator, 'storage', { value, configurable: true });
afterEach(() => {
  if (original) Object.defineProperty(navigator, 'storage', original);
  else delete navigator.storage;
});

describe('persistent storage helpers', () => {
  it('report "unsupported" in a browser without the API (never throw)', async () => {
    setStorage(undefined);
    expect(persistenceSupported()).toBe(false);
    expect(await persistenceStatus()).toBe('unsupported');
    expect(await requestPersistence()).toBe('unsupported');
    setStorage({ persist: () => true }); // half an API counts as unsupported
    expect(persistenceSupported()).toBe(false);
  });

  it('persistenceStatus only reads, never asks', async () => {
    const persist = vi.fn();
    setStorage({ persisted: async () => false, persist });
    expect(await persistenceStatus()).toBe('not-protected');
    setStorage({ persisted: async () => true, persist });
    expect(await persistenceStatus()).toBe('protected');
    expect(persist).not.toHaveBeenCalled();
  });

  it('requestPersistence reports what the browser decided', async () => {
    setStorage({ persisted: async () => false, persist: async () => true });
    expect(await requestPersistence()).toBe('protected');
    setStorage({ persisted: async () => false, persist: async () => false });
    expect(await requestPersistence()).toBe('not-protected');
  });

  it('does not ask again when the data is already protected', async () => {
    const persist = vi.fn();
    setStorage({ persisted: async () => true, persist });
    expect(await requestPersistence()).toBe('protected');
    expect(persist).not.toHaveBeenCalled();
  });

  it('a browser that throws is handled', async () => {
    setStorage({ persisted: async () => { throw new Error('nope'); }, persist: async () => { throw new Error('nope'); } });
    expect(await persistenceStatus()).toBe('unsupported');
    expect(await requestPersistence()).toBe('not-protected');
  });
});
