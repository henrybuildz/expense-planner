import { useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { KEYS } from '../../constants/storage';
import { MAX_IMPORT_BYTES, buildBackup, parseBackup } from '../../utils/backup';
import { todayISO } from '../../utils/dates';
import { useSync } from '../../context/SyncContext';
import Icon from '../ui/Icon';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const countText = (data) =>
  [
    data.transactions && plural(data.transactions.length, 'transaction'),
    data.budgets && plural(Object.keys(data.budgets).length, 'budget'),
    data.subscriptions && plural(data.subscriptions.length, 'subscription'),
  ]
    .filter(Boolean)
    .join(', ');

export default function DataBackup() {
  const { transactions, budgets, subscriptions, replaceAll, mergeAll, clearAll } = useApp();
  const isEmpty = !transactions.length && !Object.keys(budgets).length && !subscriptions.length;
  const { signedIn } = useSync();
  const fileInput = useRef(null);
  const [pending, setPending] = useState(null); // a validated file waiting for the user's choice
  const [message, setMessage] = useState(null); // { ok: boolean, text: string }

  const exportBackup = () => {
    const json = JSON.stringify(buildBackup({ transactions, budgets, subscriptions }), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `expense-planner-backup-${todayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage({
      ok: true,
      text: `Exported ${countText({ transactions, budgets, subscriptions })}. Keep the file somewhere safe.`,
    });
  };

  const onFileChosen = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = ''; // lets the same file be picked again later
    if (!file) return;
    setPending(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setMessage({ ok: false, text: 'That file is too large to be an Expense Planner backup.' });
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch {
      setMessage({ ok: false, text: 'The file could not be read.' });
      return;
    }
    const result = parseBackup(text);
    if (result.error) {
      setMessage({ ok: false, text: result.error });
      return;
    }
    setMessage(null);
    setPending({ ...result, fileName: file.name });
  };

  // Safety net shared by Replace and Delete all: keep one copy of the current data in this browser.
  const saveSafetyCopy = () => {
    try {
      window.localStorage.setItem(
        KEYS.preImportBackup,
        JSON.stringify(buildBackup({ transactions, budgets, subscriptions }))
      );
    } catch {
      /* storage full: the user has just confirmed, so proceed */
    }
  };

  const deleteAll = () => {
    const what = countText({ transactions, budgets, subscriptions });
    const synced = signedIn ? ' Because you are signed in, this ALSO deletes your synced copy on all your devices.' : '';
    if (!window.confirm(`Delete ALL your data (${what})?${synced} This cannot be undone. Export first if you want a copy.`)) return;
    saveSafetyCopy();
    clearAll();
    setPending(null);
    setMessage({ ok: true, text: 'All data deleted.' });
  };

  const apply = (mode) => {
    if (mode === 'replace') {
      saveSafetyCopy();
      replaceAll(pending.data);
    } else {
      mergeAll(pending.data);
    }
    setMessage({
      ok: true,
      text: `${mode === 'replace' ? 'Replaced your data with' : 'Merged in'} ${countText(pending.data)}.`,
    });
    setPending(null);
  };

  return (
    <section className="card" aria-labelledby="backup-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="backup-title" className="text-sm font-semibold text-slate-700">
            Backup
          </h2>
          <p className="text-xs text-slate-500">
            Your data is stored only in this browser. Export a file to keep it safe or move it to
            another computer.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={exportBackup}>
            Export data
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => fileInput.current.click()}>
            Import data
          </button>
          <button
            type="button"
            className="btn btn-secondary !text-rose-600"
            onClick={deleteAll}
            disabled={isEmpty}
          >
            Delete all data
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose a backup file to import"
            onChange={onFileChosen}
          />
        </div>
      </div>

      {pending && (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm ring-1 ring-slate-200" role="group" aria-label="Import options">
          <p className="font-medium text-slate-800">
            {pending.fileName} contains {countText(pending.data)}.
          </p>
          {pending.skipped > 0 && (
            <p className="mt-1 text-amber-700">
              {pending.skipped} invalid record{pending.skipped === 1 ? ' was' : 's were'} skipped.
            </p>
          )}
          {pending.currencyNote && <p className="mt-1 text-amber-700">{pending.currencyNote}</p>}
          {signedIn && (
            <p className="mt-1 text-amber-700">
              You are signed in, so the result is also synced to your other devices.
            </p>
          )}
          <p className="mt-2 text-slate-600">
            <strong>Merge</strong> adds anything you don&apos;t already have and keeps the rest.{' '}
            <strong>Replace</strong> overwrites the matching sections of your current data (a safety
            copy is kept in this browser).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => apply('merge')}>
              Merge
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => apply('replace')}>
              Replace my data
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <p
          className={`mt-3 flex items-start gap-2 text-sm ${message.ok ? 'text-emerald-700' : 'text-rose-600'}`}
          role={message.ok ? 'status' : 'alert'}
        >
          <Icon name={message.ok ? 'check' : 'alert'} className="mt-0.5 h-4 w-4 shrink-0" />
          {message.text}
        </p>
      )}
    </section>
  );
}
