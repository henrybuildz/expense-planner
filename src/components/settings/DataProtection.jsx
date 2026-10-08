import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useSync } from '../../context/SyncContext';
import { useToday } from '../../hooks/useToday';
import { backupLabel } from '../../utils/backupStatus';
import { exportBackupFile } from '../../utils/exportBackup';
import { persistenceStatus, requestPersistence } from '../../utils/persist';

const STORAGE_TEXT = {
  protected: 'Protected. The browser will keep your data even when the device is low on space.',
  'not-protected':
    'Not protected. If the device runs very low on space, the browser may delete this data. A backup file or signing in keeps it safe.',
  unsupported: 'This browser cannot be asked to protect the data. A backup file or signing in keeps it safe.',
};

// One place that answers "is my data safe?": browser protection, last backup, and sync.
export default function DataProtection() {
  const { transactions, budgets, subscriptions, backupStatus, markBackedUp } = useApp();
  const { enabled, signedIn } = useSync();
  const today = useToday();
  const [storage, setStorage] = useState(null); // null while checking
  const [declined, setDeclined] = useState(false); // the browser said no to a request made from this card

  useEffect(() => {
    let alive = true;
    persistenceStatus().then((s) => alive && setStorage(s));
    return () => {
      alive = false;
    };
  }, []);

  const protect = async () => {
    const result = await requestPersistence();
    setStorage(result);
    setDeclined(result !== 'protected');
  };

  return (
    <section className="card" aria-labelledby="protect-title">
      <h2 id="protect-title" className="text-sm font-semibold text-slate-700">
        Data protection
      </h2>
      <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Browser storage</dt>
          <dd className="mt-1 text-slate-700" data-testid="storage-status">
            {storage ? STORAGE_TEXT[storage] : 'Checking…'}
          </dd>
          {storage === 'not-protected' && (
            <button type="button" className="btn btn-secondary mt-2" onClick={protect}>
              Ask the browser to protect it
            </button>
          )}
          {declined && storage === 'not-protected' && (
            <p className="mt-2 text-xs text-slate-500" role="status">
              The browser said no. It decides by itself, mostly from how often you use the app. Installing Pocket
              Book as an app usually helps. A backup file or signing in is the dependable fix.
            </p>
          )}
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Last backup file</dt>
          <dd className="mt-1 text-slate-700">{backupLabel(backupStatus, today)}</dd>
          <button
            type="button"
            className="btn btn-secondary mt-2"
            onClick={() => {
              exportBackupFile({ transactions, budgets, subscriptions });
              markBackedUp();
            }}
          >
            Export now
          </button>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Saved in your account</dt>
          <dd className="mt-1 text-slate-700">
            {!enabled
              ? 'Not available in this version of the app.'
              : signedIn
                ? 'Yes. Your data is also stored in your account and syncs across your devices.'
                : 'No. Sign in below to keep a copy in your account.'}
          </dd>
        </div>
      </dl>
    </section>
  );
}
