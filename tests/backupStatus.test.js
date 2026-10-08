import { describe, expect, it } from 'vitest';
import { EMPTY_BACKUP_STATUS, NUDGE_AFTER_DAYS, backupLabel, daysSince, needsBackupNudge, snoozeDate } from '../src/utils/backupStatus';
import { sanitizeBackupStatus } from '../src/utils/sanitize';

const status = (over = {}) => ({ ...EMPTY_BACKUP_STATUS, ...over });
const ctx = { hasData: true, signedIn: false };

describe('daysSince', () => {
  it('counts whole days and never goes negative', () => {
    expect(daysSince('2026-10-01', '2026-10-08')).toBe(7);
    expect(daysSince('2026-10-08', '2026-10-08')).toBe(0);
    expect(daysSince('2026-10-20', '2026-10-08')).toBe(0); // clock moved backwards
    expect(daysSince('2026-03-27', '2026-03-30')).toBe(3); // across the DST change
  });
});

describe('needsBackupNudge', () => {
  it('waits a full period: 6 days is too early, 7 is due (from the first data, when never backed up)', () => {
    expect(needsBackupNudge(status({ since: '2026-10-02' }), '2026-10-08', ctx)).toBe(false);
    expect(needsBackupNudge(status({ since: '2026-10-01' }), '2026-10-08', ctx)).toBe(true);
    expect(NUDGE_AFTER_DAYS).toBe(7);
  });

  it('measures from the last backup when there is one', () => {
    expect(needsBackupNudge(status({ since: '2026-01-01', lastBackup: '2026-10-05' }), '2026-10-08', ctx)).toBe(false);
    expect(needsBackupNudge(status({ since: '2026-01-01', lastBackup: '2026-10-01' }), '2026-10-08', ctx)).toBe(true);
  });

  it('never nags with no data, when signed in, or before the data has been noticed', () => {
    const old = status({ since: '2025-01-01' });
    expect(needsBackupNudge(old, '2026-10-08', { hasData: false, signedIn: false })).toBe(false);
    expect(needsBackupNudge(old, '2026-10-08', { hasData: true, signedIn: true })).toBe(false);
    expect(needsBackupNudge(EMPTY_BACKUP_STATUS, '2026-10-08', ctx)).toBe(false);
  });

  it('respects the snooze, then asks again on the day it ends', () => {
    const s = status({ since: '2026-01-01', snoozeUntil: '2026-10-15' });
    expect(needsBackupNudge(s, '2026-10-08', ctx)).toBe(false);
    expect(needsBackupNudge(s, '2026-10-14', ctx)).toBe(false);
    expect(needsBackupNudge(s, '2026-10-15', ctx)).toBe(true);
    expect(snoozeDate('2026-10-08')).toBe('2026-10-15');
    expect(snoozeDate('2026-12-28')).toBe('2027-01-04');
  });
});

describe('backupLabel', () => {
  it.each([
    [null, 'Never'],
    ['2026-10-08', 'Today'],
    ['2026-10-07', 'Yesterday'],
    ['2026-10-01', '7 days ago'],
  ])('%s -> %s', (last, label) => expect(backupLabel(status({ lastBackup: last }), '2026-10-08')).toBe(label));
});

describe('sanitizeBackupStatus', () => {
  it('keeps valid dates and nulls out everything else', () => {
    expect(sanitizeBackupStatus({ lastBackup: '2026-10-01', since: '2026-09-01', snoozeUntil: '2026-10-15' })).toEqual({
      lastBackup: '2026-10-01', since: '2026-09-01', snoozeUntil: '2026-10-15',
    });
    expect(sanitizeBackupStatus({ lastBackup: '2026-02-31', since: 5, snoozeUntil: 'soon', extra: 1 })).toEqual(EMPTY_BACKUP_STATUS);
    expect(sanitizeBackupStatus({})).toEqual(EMPTY_BACKUP_STATUS);
  });
  it('rejects non-objects', () => {
    [null, undefined, [], 'x', 5].forEach((v) => expect(sanitizeBackupStatus(v)).toBeUndefined());
  });
});
