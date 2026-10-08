import AccountSync from '../account/AccountSync';
import DataBackup from '../backup/DataBackup';
import { syncEnabled } from '../../lib/supabase';
import Icon from '../ui/Icon';

// Everything that is about the app itself (not your money) lives here: sign-in & sync, backups.
export default function Settings({ onClose }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-secondary !px-3" onClick={onClose}>
          <Icon name="back" className="h-4 w-4" /> Back
        </button>
        <h2 id="settings-title" className="text-xl font-semibold tracking-tight">
          Settings
        </h2>
      </div>

      <div className={`grid items-start gap-6 ${syncEnabled ? 'lg:grid-cols-2' : ''}`}>
        <AccountSync />
        <DataBackup />
      </div>

      <section className="card" aria-labelledby="about-title">
        <h2 id="about-title" className="text-sm font-semibold text-slate-700">
          About &amp; privacy
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Pocket Book keeps your data in this browser and works fully offline. If you sign in, your data
          is also stored in your own account on Supabase so that all your devices stay the same; it is
          protected so only you can read it, but it is not end-to-end encrypted. There are no ads,
          analytics or trackers.
        </p>
      </section>
    </div>
  );
}
