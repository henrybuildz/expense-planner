import { syncEnabled } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { useSync } from '../../context/SyncContext';
import { useToday } from '../../hooks/useToday';
import { backupLabel, daysSince, needsBackupNudge } from '../../utils/backupStatus';
import { exportBackupFile } from '../../utils/exportBackup';
import Icon from '../ui/Icon';

// A gentle reminder on the Dashboard for people whose data lives only in this browser.
export default function BackupNudge() {
  const { transactions, budgets, subscriptions, hasData, backupStatus, markBackedUp, snoozeBackupNudge } = useApp();
  const { signedIn } = useSync();
  const today = useToday();
  if (!needsBackupNudge(backupStatus, today, { hasData, signedIn })) return null;

  const reference = backupStatus.lastBackup || backupStatus.since;
  const days = daysSince(reference, today);
  const text = backupStatus.lastBackup
    ? `Your last backup was ${backupLabel(backupStatus, today).toLowerCase()}.`
    : `You have been using Pocket Book for ${days} days without a backup.`;

  return (
    <section aria-label="Backup reminder" className="card border-l-4 border-amber-400">
      <div className="flex items-start gap-3">
        <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-800">Back up your data</h2>
          <p className="mt-1 text-sm text-slate-600">
            {text} Your data is stored only in this browser, so clearing the browser&apos;s data would erase it.
            Save a backup file{syncEnabled ? ', or sign in under Settings to keep it in your account' : ''}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                exportBackupFile({ transactions, budgets, subscriptions });
                markBackedUp();
              }}
            >
              Export a backup now
            </button>
            <button type="button" className="btn btn-secondary" onClick={snoozeBackupNudge}>
              Remind me in 7 days
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
