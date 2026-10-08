import { useSync } from '../../context/SyncContext';
import { SkeletonAccount } from '../ui/Skeleton';
import Icon from '../ui/Icon';

function statusLine({ status, lastSyncedAt, error }) {
  if (status === 'syncing') return { text: 'Syncing…', tone: 'text-slate-500' };
  if (status === 'offline') {
    return { text: 'Offline. Your changes are saved here and will sync when you are back online.', tone: 'text-amber-700' };
  }
  if (status === 'attention') return { text: 'Syncing is paused until you choose below.', tone: 'text-amber-700' };
  if (status === 'error') return { text: `Sync problem: ${error}`, tone: 'text-rose-600' };
  if (lastSyncedAt) {
    return {
      text: `Up to date · last synced ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      tone: 'text-emerald-700',
    };
  }
  return { text: 'Waiting to sync…', tone: 'text-slate-500' };
}

export default function AccountSync() {
  const {
    enabled, authReady, user, signedIn, status, lastSyncedAt, error, attention,
    restoreFromAccount, deleteEverywhere, signIn, signOut, signOutAndWipe, syncNow,
  } = useSync();

  // Not configured (no Supabase settings in this build): the app is local-only, as before.
  if (!enabled) return null;
  if (!authReady) return <SkeletonAccount />;

  if (!signedIn) {
    return (
      <section className="card" aria-labelledby="sync-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-xl">
            <h2 id="sync-title" className="text-sm font-semibold text-slate-700">
              Sync across devices
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Optional. Sign in with Google to keep your data the same on all your devices. It then also
              lives on Supabase&apos;s servers, locked to your account (it is not end-to-end encrypted). The
              app keeps working offline either way.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={signIn}>
            Sign in with Google
          </button>
        </div>
        {error && (
          <p className="mt-3 flex items-start gap-2 text-sm text-rose-600" role="alert">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </section>
    );
  }

  const line = statusLine({ status, lastSyncedAt, error });
  const missing = attention ? Object.values(attention).reduce((n, t) => n + t.deletes, 0) : 0;
  return (
    <section className="card" aria-labelledby="sync-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="sync-title" className="text-sm font-semibold text-slate-700">
            Sync
          </h2>
          <p className="truncate text-xs text-slate-500">Signed in as {user.email}</p>
          <p className={`mt-1 text-xs ${line.tone}`} role="status">
            {line.text}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={syncNow} disabled={status === 'syncing'}>
            Sync now
          </button>
          <button type="button" className="btn btn-secondary" onClick={signOut}>
            Sign out
          </button>
          <button type="button" className="btn btn-secondary !text-rose-600" onClick={signOutAndWipe}>
            Sign out and remove data from this device
          </button>
        </div>
      </div>

      {attention && (
        <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200" role="alert">
          <p className="flex items-start gap-2 font-medium">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            {missing} saved records are missing from this device, so syncing was paused.
          </p>
          <p className="mt-1">
            If you did not delete them on purpose, they may have been lost on this device. Your account
            still has them, so restoring is the safe choice. Nothing has been changed yet.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={restoreFromAccount}>
              Restore them from my account
            </button>
            <button
              type="button"
              className="btn btn-secondary !text-rose-600"
              onClick={() => {
                if (window.confirm(`Delete these ${missing} records from your account and every device?`)) deleteEverywhere();
              }}
            >
              Delete them everywhere
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
