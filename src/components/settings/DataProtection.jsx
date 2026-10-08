import { useEffect, useState } from 'react';
import { persistenceStatus, requestPersistence } from '../../utils/persist';

const STORAGE_TEXT = {
  protected: 'Protected. The browser will keep your data even when the device is low on space.',
  'not-protected':
    'Not protected. If the device runs very low on space, the browser may delete this data. A backup file or signing in keeps it safe.',
  unsupported: 'This browser cannot be asked to protect the data. A backup file or signing in keeps it safe.',
};

// Browser storage protection: the one thing here that cannot be done anywhere else. (The last-backup date,
// the second "Export now" button and the "saved in your account" line repeated what the Backup and Sync
// cards and the Dashboard reminder already show, so they were removed.)
export default function DataProtection() {
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
    <section className="card" aria-label="Browser storage">
      <p className="text-sm text-slate-700" data-testid="storage-status">
        {storage ? STORAGE_TEXT[storage] : 'Checking…'}
      </p>
      {storage === 'not-protected' && (
        <button type="button" className="btn btn-secondary mt-3" onClick={protect}>
          Ask the browser to protect it
        </button>
      )}
      {declined && storage === 'not-protected' && (
        <p className="mt-2 text-xs text-slate-500" role="status">
          The browser said no. It decides by itself, mostly from how often you use the app. Installing Pocket Book
          as an app usually helps. A backup file or signing in is the dependable fix.
        </p>
      )}
    </section>
  );
}
