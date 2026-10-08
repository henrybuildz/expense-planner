import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom does not implement these browser features that the app uses.
URL.createObjectURL = vi.fn(() => 'blob:test');
URL.revokeObjectURL = vi.fn();
window.scrollTo = vi.fn();

// Every test starts from a blank browser: no leftover data, no leftover timers.
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.useRealTimers();
});
