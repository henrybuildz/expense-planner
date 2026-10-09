import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'public/splash.js'), 'utf8');
const run = () => new Function(source)(); // the script is a plain IIFE that uses window / document

beforeEach(() => {
  document.documentElement.className = '';
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('launch splash', () => {
  it('plays on a fresh launch and remembers when', () => {
    run();
    expect(document.documentElement.classList.contains('no-splash')).toBe(false);
    expect(Number(localStorage.getItem('pocket-book:splash-last'))).toBeGreaterThan(0);
  });

  it('is skipped when the app is reopened within half an hour', () => {
    localStorage.setItem('pocket-book:splash-last', String(Date.now() - 5 * 60 * 1000));
    run();
    expect(document.documentElement.classList.contains('no-splash')).toBe(true);
  });

  it('plays again after half an hour', () => {
    localStorage.setItem('pocket-book:splash-last', String(Date.now() - 31 * 60 * 1000));
    run();
    expect(document.documentElement.classList.contains('no-splash')).toBe(false);
  });

  it('?splash always forces it', () => {
    localStorage.setItem('pocket-book:splash-last', String(Date.now()));
    window.history.replaceState({}, '', '/?splash');
    run();
    expect(document.documentElement.classList.contains('no-splash')).toBe(false);
  });
});
