import { useEffect, useRef, useState } from 'react';
import { MAX_DATE, MIN_DATE, formatDate, formatDateInput, parseDateInput } from '../../utils/dates';
import Icon from './Icon';

const canPickNatively = () =>
  typeof HTMLInputElement !== 'undefined' && typeof HTMLInputElement.prototype.showPicker === 'function';

// Date field that always reads and writes European DD/MM/YYYY. A native type="date" box cannot do that: browsers
// show it in the system's own format. So this is a text box that formats itself while you type, plus a
// calendar button that opens the browser's date picker where one is available.
//   value    : stored date 'YYYY-MM-DD' ('' while what is typed is not a complete, real date)
//   onChange : called with 'YYYY-MM-DD', or '' while the text is incomplete or impossible (31/02/2026)
export default function DateInput({ value, onChange, className = '', ...rest }) {
  const [text, setText] = useState(() => (value ? formatDate(value) : ''));
  const picker = useRef(null);
  const showPicker = canPickNatively();
  const hintId = `${rest.id ?? 'date'}-hint`;

  // The form changed the date itself (editing another record, resetting after a save): show it. Deliberately
  // depends on `value` only: our own typing already updated `text`, so reacting to `text` would fight the user.
  useEffect(() => {
    if (value && value !== parseDateInput(text)) setText(formatDate(value));
  }, [value]);

  const handleChange = (e) => {
    const next = formatDateInput(e.target.value, { deleting: e.target.value.length < text.length });
    setText(next);
    onChange(parseDateInput(next) ?? '');
  };

  // Tidy "8/1/2026" into "08/01/2026" once the person leaves the box.
  const handleBlur = () => {
    const iso = parseDateInput(text);
    if (iso) setText(formatDate(iso));
  };

  const pick = (iso) => {
    if (!iso) return;
    setText(formatDate(iso));
    onChange(iso);
  };

  const openPicker = () => {
    try {
      picker.current.showPicker();
    } catch {
      /* the browser refused (e.g. not a user gesture): typing still works */
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/YYYY"
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-describedby={hintId}
        className={`${className} ${showPicker ? 'pr-10' : ''}`}
        {...rest}
      />
      {/* A placeholder vanishes once you type, so say the format to screen readers too. */}
      <span id={hintId} className="sr-only">
        Type the date as day, month, year, like DD/MM/YYYY.
      </span>
      {showPicker && (
        <>
          <button
            type="button"
            onClick={openPicker}
            aria-label="Open calendar"
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 transition hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            <Icon name="calendar" className="h-4 w-4" />
          </button>
          {/* The browser's own picker, kept invisible: it only supplies the chosen day. */}
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            min={MIN_DATE}
            max={MAX_DATE}
            value={value || ''}
            onChange={(e) => pick(e.target.value)}
            className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
          />
        </>
      )}
    </div>
  );
}
