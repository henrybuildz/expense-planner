// @vitest-environment node
// scripts/keepalive.sh with a fake `curl` first on PATH, so every Supabase answer can be simulated offline.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = path.resolve('scripts/keepalive.sh');
const dir = mkdtempSync(path.join(tmpdir(), 'keepalive-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// The fake curl writes BODY to the --output file, prints STATUS (what --write-out would), and exits with CURL_EXIT.
writeFileSync(
  path.join(dir, 'curl'),
  `#!/usr/bin/env bash
out=""
while [ $# -gt 0 ]; do case "$1" in --output) out="$2"; shift;; esac; shift; done
[ -n "$out" ] && printf '%s' "$FAKE_BODY" > "$out"
printf '%s' "$FAKE_STATUS"
exit "\${FAKE_CURL_EXIT:-0}"
`
);
chmodSync(path.join(dir, 'curl'), 0o755);

const run = (env = {}) =>
  spawnSync('bash', [script], {
    encoding: 'utf8',
    env: { PATH: `${dir}:${process.env.PATH}`, SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_KEY: 'sb_publishable_x', ...env },
  });

const DENIED = '{"code":"42501","message":"permission denied for table transactions"}';

describe('keepalive.sh', () => {
  it('succeeds when the query runs (200)', () => {
    expect(run({ FAKE_STATUS: '200', FAKE_BODY: '[]' }).status).toBe(0);
  });

  it('succeeds on Postgres "permission denied" (42501): the database answered and the lockdown held', () => {
    const r = run({ FAKE_STATUS: '401', FAKE_BODY: DENIED });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/awake and locked down/);
  });

  it.each([
    ['401 for another reason (wrong key)', '401', '{"message":"Invalid API key"}'],
    ['paused or missing project (404)', '404', '{"message":"not found"}'],
    ['server error (500)', '500', 'oops'],
    ['gateway error (540)', '540', ''],
    ['no HTTP answer at all', '000', ''],
    ['200-looking code inside a 403', '403', DENIED],
  ])('FAILS on %s', (_label, status, body) => {
    const r = run({ FAKE_STATUS: status, FAKE_BODY: body });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/Unexpected answer/);
  });

  it('FAILS when curl itself fails (DNS, timeout)', () => {
    expect(run({ FAKE_STATUS: '', FAKE_BODY: '', FAKE_CURL_EXIT: '6' }).status).not.toBe(0);
  });

  it('refuses any URL that is not https://<project>.supabase.co (never sends the key elsewhere)', () => {
    const hostile = [
      'https://evil.example.com',
      'http://abc.supabase.co',
      'https://abc.supabase.co.evil.com',
      'ftp://x.supabase.co',
      'https://evil.com/x.supabase.co', // a shell glob would let "*" swallow the slash
      'https://evil.com#.supabase.co',
      'https://evil.com?.supabase.co',
      'https://user@evil.com/.supabase.co',
      'https://abc.supabase.co@evil.com',
      'https://abc.supabase.co/rest/v1/other',
      'https://abc.supabase.co?x=1',
      'https://a.b.supabase.co',
      'https://-.supabase.co',
      'https://.supabase.co',
      'https://ABC.supabase.co',
      'https://abc.supabase.co\n--header x:y',
      ' https://abc.supabase.co',
    ];
    for (const url of hostile) {
      const r = run({ SUPABASE_URL: url, FAKE_STATUS: '200', FAKE_BODY: '[]' });
      expect(r.status, JSON.stringify(url)).toBe(2);
    }
  });

  it('accepts a normal project URL, with or without a trailing slash', () => {
    for (const url of ['https://abcdefghijklmnop.supabase.co', 'https://abc-123.supabase.co/']) {
      expect(run({ SUPABASE_URL: url, FAKE_STATUS: '200', FAKE_BODY: '[]' }).status, url).toBe(0);
    }
  });

  it('FAILS when the variables are missing (an unset repository variable must be loud)', () => {
    expect(run({ SUPABASE_URL: '', FAKE_STATUS: '200' }).status).not.toBe(0);
    expect(run({ SUPABASE_KEY: '', FAKE_STATUS: '200' }).status).not.toBe(0);
  });
});
