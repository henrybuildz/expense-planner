// "When did you last back up?" logic. Pure, so it is easy to test: today is always passed in.
import { addDays, daysUntil } from './dates';

export const NUDGE_AFTER_DAYS = 7; // remind this long after the last backup (or after the first data was saved)
export const SNOOZE_DAYS = 7; // "Remind me later" waits this long

export const EMPTY_BACKUP_STATUS = { lastBackup: null, since: null, snoozeUntil: null };

// Whole days between two dates (0 = same day). Never negative, even if the clock was moved back.
export const daysSince = (iso, today) => Math.max(0, -daysUntil(iso, today));

/**
 * Should the Dashboard ask for a backup? Only for someone who has data and is NOT signed in (signed-in
 * data is already saved in their account), once the reference date is old enough, unless snoozed.
 */
export function needsBackupNudge(status, today, { hasData, signedIn }) {
  if (!hasData || signedIn) return false;
  const reference = status.lastBackup || status.since;
  if (!reference) return false; // we only just noticed the data: give it a full period first
  if (status.snoozeUntil && today < status.snoozeUntil) return false;
  return daysSince(reference, today) >= NUDGE_AFTER_DAYS;
}

export function backupLabel(status, today) {
  if (!status.lastBackup) return 'Never';
  const days = daysSince(status.lastBackup, today);
  if (days === 0) return 'Today';
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

export const snoozeDate = (today) => addDays(today, SNOOZE_DAYS);
