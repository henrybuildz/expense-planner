import { useSync } from '../../context/SyncContext';
import Icon from '../ui/Icon';

function statusLine({ status, lastSyncedAt, error }) {
  if (status === 'syncing') return { text: 'Syncing…', tone: 'text-slate-500' };
  if (status === 'offline') {
    return { text: 'Offline. Your changes are saved here and will sync when you are back online.', tone: 'text-amber-700' };
  }
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
  const { enabled, authReady, user, signedIn, status, lastSyncedAt, error, signIn, signOut, signOutAndWipe, syncNow } =
    useSync();

  // Not configured (no Supabase settings in this build): the app is local-only, as before.
  if (!enabled) return null;
  if (!authReady) return null;

  if (!signedIn) {
    return (
      <section className="card" aria-labelledby="sync-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-xl">
            <h2 id="sync-title" className="text-sm font-semibold text-slate-700">
              Sync across devices
            </h2>
            <p className="text-xs text-slate-500">
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
    </section>
  );
}
