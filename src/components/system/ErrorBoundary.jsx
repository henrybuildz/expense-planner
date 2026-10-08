import { Component, useEffect, useRef, useState } from 'react';
import { todayISO } from '../../utils/dates';
import { buildRawDump, buildRescueBackup, downloadJson, resetLocalData } from '../../utils/rescue';
import Icon from '../ui/Icon';

// Plain text a person can paste into a message. Contains NO financial data: only the error, where it
// happened, and the browser.
function describe(error, componentStack) {
  const lines = [
    `Pocket Book crash report - ${new Date().toISOString()}`,
    `Error: ${(error && error.message ? error.message : String(error)).slice(0, 300)}`,
    `Page: ${window.location.origin}${window.location.pathname}`,
    `Browser: ${navigator.userAgent}`,
  ];
  if (error && error.stack) lines.push('', 'Stack:', error.stack.split('\n').slice(0, 8).join('\n'));
  if (componentStack) lines.push('', 'Component stack:', componentStack.trim().split('\n').slice(0, 8).join('\n'));
  return lines.join('\n');
}

// Self-contained on purpose: no app context, no hooks from the app. If providers are what crashed,
// this still has to render and still has to be able to save the user's data.
function CrashScreen({ error, componentStack, variant, repeated, onRetry }) {
  const [note, setNote] = useState('');
  const box = useRef(null);
  // The crash replaced whatever had focus; put it on the message so keyboard and screen-reader users land here.
  useEffect(() => {
    if (box.current) box.current.focus();
  }, []);
  const report = describe(error, componentStack);
  const panel = variant === 'panel';
  const Heading = panel ? 'h2' : 'h1'; // the page already has its own h1

  const run = (label, job) => {
    try {
      job();
      setNote(label);
    } catch (e) {
      setNote(`That did not work (${e && e.message ? e.message : 'unknown error'}). Try Reload, then Export from Settings.`);
    }
  };

  const exportData = () =>
    run('Saved a copy of your data. You can import this file later from Settings.', () =>
      downloadJson(`pocket-book-rescue-${todayISO()}.json`, buildRescueBackup())
    );
  const exportRaw = () =>
    run('Saved the raw storage file.', () =>
      downloadJson(`pocket-book-raw-${todayISO()}.json`, buildRawDump())
    );
  const startFresh = () => {
    if (
      !window.confirm(
        'Start fresh?\n\nThis clears Pocket Book\u2019s data on this device. A backup file is downloaded first and a copy is kept in this browser. If you are signed in, your synced data comes back on the next sync.'
      )
    ) {
      return;
    }
    run('Your data was backed up and cleared. Reloading\u2026', () => {
      resetLocalData();
      window.setTimeout(() => window.location.reload(), 700); // let the download start first
    });
  };
  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setNote('Details copied.');
    } catch {
      setNote('Could not copy automatically. Select the details below and copy them.');
    }
  };

  return (
    <div
      role="alert"
      ref={box}
      tabIndex={-1}
      className={
        panel
          ? 'card mx-auto max-w-xl text-left outline-none'
          : 'flex min-h-screen outline-none items-center justify-center bg-slate-50 p-6'
      }
    >
      <div className={panel ? '' : 'w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/70'}>
        <div className={`flex ${panel ? 'items-start gap-3' : 'flex-col items-center gap-3'}`}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <Icon name="alert" className="h-6 w-6" />
          </span>
          <div>
            <Heading className="text-lg font-semibold text-slate-800">
              {panel ? 'This part hit a problem' : 'Something went wrong'}
            </Heading>
            <p className="mt-1 text-sm text-slate-600">
              Pocket Book ran into an unexpected problem. Your data has not been touched by it
              {panel ? '; the rest of the app still works.' : '.'} You can try again, reload, or save a copy of
              your data first.
            </p>
          </div>
        </div>

        {repeated && (
          <p className="mt-3 text-sm font-medium text-amber-700">
            That did not fix it. Try Reload. If it keeps happening, save a copy of your data first, then use
            &ldquo;Start fresh&rdquo; under Technical details.
          </p>
        )}

        <div className={`mt-5 flex flex-wrap gap-2 ${panel ? '' : 'justify-center'}`}>
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Try again
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button type="button" className="btn btn-secondary" onClick={exportData}>
            Export my data
          </button>
        </div>

        {note && (
          <p className="mt-3 text-sm text-slate-600" role="status">
            {note}
          </p>
        )}

        <details className={`mt-4 text-xs text-slate-500 ${panel ? '' : 'text-left'}`}>
          <summary className="cursor-pointer select-none">Technical details</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">
            {report}
          </pre>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary !px-3 !py-1 text-xs" onClick={copyDetails}>
              Copy details
            </button>
            <button type="button" className="btn btn-secondary !px-3 !py-1 text-xs" onClick={exportRaw}>
              Download raw storage (advanced)
            </button>
            <button type="button" className="btn btn-secondary !px-3 !py-1 text-xs !text-rose-600" onClick={startFresh}>
              Start fresh (advanced)
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}

/**
 * Catches errors thrown while rendering its children and shows a recovery screen instead of a blank page.
 *   variant="page"  : full-screen (wraps the whole app)
 *   variant="panel" : inline card (wraps one section, so the header and tabs stay usable)
 *   resetKey        : when it changes (e.g. the user switches tab) the boundary tries the children again
 * Not caught by design (React limitation): errors inside event handlers, timers and promises.
 */
export default class ErrorBoundary extends Component {
  state = { error: null, componentStack: '', repeated: false };
  lastRetryAt = 0;

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // crashing again within seconds of "Try again" means retrying will not help
    this.setState({
      componentStack: info && info.componentStack ? info.componentStack : '',
      repeated: Date.now() - this.lastRetryAt < 3000,
    });
    console.error('[Pocket Book] The screen crashed:', error, info && info.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.lastRetryAt = 0; // a different section: a fresh start, not a retry
      this.setState({ error: null, componentStack: '', repeated: false });
    }
  }

  reset = () => {
    this.lastRetryAt = Date.now();
    this.setState({ error: null, componentStack: '', repeated: false });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <CrashScreen
        error={this.state.error}
        componentStack={this.state.componentStack}
        variant={this.props.variant || 'page'}
        repeated={this.state.repeated}
        onRetry={this.reset}
      />
    );
  }
}
