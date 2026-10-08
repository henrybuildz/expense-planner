import { buildBackup } from './backup';
import { todayISO } from './dates';
import { downloadJson } from './rescue';

// The one place that writes the normal backup file (Settings, the Dashboard reminder).
export function exportBackupFile(data) {
  downloadJson(`pocket-book-backup-${todayISO()}.json`, buildBackup(data));
}
