import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { resetStorageFailureForTests } from '../src/hooks/useLocalStorage';
import { resetPersistenceAskedForTests } from '../src/hooks/useRequestPersistence';

// A few test files opt out of the browser (`// @vitest-environment node`), e.g. the one that runs a shell script.
const inBrowser = typeof window !== 'undefined';

// jsdom does not implement these browser features that the app uses.
if (inBrowser) {
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  window.scrollTo = vi.fn();
}

// Every test starts from a blank browser: no leftover data, no leftover timers.
afterEach(() => {
  if (inBrowser) {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
  }
  resetStorageFailureForTests();
  resetPersistenceAskedForTests();
  vi.useRealTimers();
});
