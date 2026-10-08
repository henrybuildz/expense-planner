import { describe, expect, it, vi } from 'vitest';
import {
  addCycle,
  addDays,
  addMonths,
  currentMonthKey,
  dateMatchesQuery,
  daysUntil,
  formatDate,
  formatDateInput,
  isValidISO,
  lastMonthKeys,
  monthKey,
  parseDateInput,
  startOfWeek,
  toISO,
} from '../src/utils/dates';

describe('isValidISO', () => {
  it('accepts normal dates and the supported range edges', () => {
    ['2026-10-07', '1900-01-01', '2100-12-31', '2024-02-29'].forEach((d) => expect(isValidISO(d)).toBe(true));
  });

  it('rejects impossible calendar dates', () => {
    ['2026-02-31', '2026-13-01', '2026-00-10', '2025-02-29', '2026-04-31'].forEach((d) =>
      expect(isValidISO(d)).toBe(false)
    );
  });

  it('rejects out-of-range years and wrong shapes/types', () => {
    ['0002-01-01', '1899-12-31', '2101-01-01', '2026-1-1', '20260101', '', null, undefined, 20260101, {}].forEach((d) =>
      expect(isValidISO(d)).toBe(false)
    );
  });
});

describe('addMonths / addCycle (month-end handling)', () => {
  it('clamps to the last day of a short month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // leap year
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('does NOT drift when given the anchor day: Jan 31 > Feb 28 > Mar 31 > Apr 30 > May 31', () => {
    // Regression: without an anchor a bill due on the 31st slid permanently to the 28th.
    const seq = ['2026-01-31'];
    for (let i = 0; i < 4; i += 1) seq.push(addCycle(seq[i], 'monthly', 31));
    expect(seq).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('shows the drift the anchor prevents (documents why the anchor exists)', () => {
    let d = '2026-01-31';
    for (let i = 0; i < 4; i += 1) d = addCycle(d, 'monthly'); // no anchor
    expect(d).toBe('2026-05-28');
  });

  it('handles every cycle length', () => {
    expect(addCycle('2026-10-01', 'weekly')).toBe('2026-10-08');
    expect(addCycle('2026-10-01', 'biweekly')).toBe('2026-10-15');
    expect(addCycle('2026-10-01', 'monthly', 1)).toBe('2026-11-01');
    expect(addCycle('2026-10-01', 'quarterly', 1)).toBe('2027-01-01');
    expect(addCycle('2026-10-01', 'yearly', 1)).toBe('2027-10-01');
    expect(addCycle('2024-02-29', 'yearly', 29)).toBe('2025-02-28'); // leap day
  });

  it('crosses year boundaries and daylight-saving changes correctly', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // spans the EU clock change
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });
});

describe('startOfWeek (weeks run Monday to Sunday)', () => {
  const cases = [
    ['2026-10-05', '2026-10-05'], // Monday stays
    ['2026-10-07', '2026-10-05'], // Wednesday
    ['2026-10-11', '2026-10-05'], // Sunday belongs to the week that started Monday
    ['2026-10-12', '2026-10-12'], // next Monday starts a new week
    ['2026-01-01', '2025-12-29'], // crosses the year
    ['2027-01-03', '2026-12-28'],
    ['2024-03-01', '2024-02-26'], // leap year
  ];
  it.each(cases)('%s -> week starts %s', (input, monday) => {
    expect(startOfWeek(input)).toBe(monday);
    expect(new Date(`${monday}T12:00:00`).getDay()).toBe(1);
  });
});

describe('daysUntil / month keys', () => {
  it('counts whole days using an injected "today"', () => {
    expect(daysUntil('2026-10-10', '2026-10-07')).toBe(3);
    expect(daysUntil('2026-10-07', '2026-10-07')).toBe(0);
    expect(daysUntil('2026-10-01', '2026-10-07')).toBe(-6);
    expect(daysUntil('2026-03-30', '2026-03-28')).toBe(2); // across DST
  });

  it('builds month keys ending at the month of "today"', () => {
    expect(lastMonthKeys(6, '2026-10-08')).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(lastMonthKeys(3, '2026-01-15')).toEqual(['2025-11', '2025-12', '2026-01']);
    expect(currentMonthKey('2026-10-08')).toBe('2026-10');
    expect(monthKey('2026-10-08')).toBe('2026-10');
  });

  it('toISO uses the local calendar day', () => {
    expect(toISO(new Date(2026, 9, 7, 23, 59, 59))).toBe('2026-10-07');
    expect(toISO(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
  });
});

describe('formatDate (European DD/MM/YYYY, whatever the browser language)', () => {
  it('writes day/month/year with leading zeros', () => {
    expect(formatDate('2026-10-08')).toBe('08/10/2026');
    expect(formatDate('2026-01-31')).toBe('31/01/2026');
    expect(formatDate('1900-01-01')).toBe('01/01/1900');
    expect(formatDate('2100-12-31')).toBe('31/12/2100');
    expect(formatDate('2024-02-29')).toBe('29/02/2024');
  });
  it('does not depend on locale or timezone (plain string work)', () => {
    const spy = vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('Oct 8, 2026');
    expect(formatDate('2026-10-08')).toBe('08/10/2026');
    spy.mockRestore();
  });
  it('hands back something readable instead of "Invalid Date" for bad input', () => {
    expect(formatDate('nonsense')).toBe('nonsense');
    expect(formatDate('')).toBe('');
    expect(formatDate(undefined)).toBe('');
  });
});

describe('parseDateInput (what was typed -> stored YYYY-MM-DD)', () => {
  it.each([
    ['08/10/2026', '2026-10-08'],
    ['8/10/2026', '2026-10-08'],
    ['8/1/2026', '2026-01-08'],
    ['08.10.2026', '2026-10-08'],
    ['08-10-2026', '2026-10-08'],
    ['08 10 2026', '2026-10-08'],
    ['08102026', '2026-10-08'],
    ['2026-10-08', '2026-10-08'], // pasted in the stored format
    ['29/02/2024', '2024-02-29'],
    ['01/01/1900', '1900-01-01'],
    ['31/12/2100', '2100-12-31'],
  ])('%s -> %s', (typed, iso) => expect(parseDateInput(typed)).toBe(iso));

  it.each([
    '', '8', '08/1', '08/10', '08/10/2', '08/10/202', '31/02/2026', '29/02/2025', '00/10/2026', '10/00/2026',
    '32/01/2026', '01/13/2026', '31/04/2026', '31/12/1899', '01/01/2101', '08/10/26', '1/1/1', 'ab/cd/efgh',
    '08/10/2026/1', '10/08/2026x', null, undefined, 20261008, {},
  ])('rejects %j', (typed) => expect(parseDateInput(typed)).toBeNull());

  it('month-first input is NOT guessed: 10/08/2026 is 10 August, not 8 October', () => {
    expect(parseDateInput('10/08/2026')).toBe('2026-08-10');
    expect(parseDateInput('13/08/2026')).toBe('2026-08-13');
    expect(parseDateInput('08/13/2026')).toBeNull(); // there is no 13th month
  });

  it('round-trips every day of a leap year', () => {
    for (let day = 0; day < 366; day += 1) {
      const iso = addDays('2024-01-01', day);
      expect(parseDateInput(formatDate(iso))).toBe(iso);
    }
  });
});

describe('formatDateInput (the box formats itself while typing)', () => {
  const typeIt = (keys) => {
    let text = '';
    const steps = [];
    for (const k of keys) {
      const raw = text + k;
      text = formatDateInput(raw, { deleting: false });
      steps.push(text);
    }
    return steps;
  };

  it('digits only: slashes appear by themselves', () => {
    expect(typeIt('08102026')).toEqual(['0', '08', '08/1', '08/10', '08/10/2', '08/10/20', '08/10/202', '08/10/2026']);
  });

  it('honours slashes you type yourself, so single-digit days and months work', () => {
    expect(typeIt('8/1/2026')).toEqual(['8', '8/', '8/1', '8/1/', '8/1/2', '8/1/20', '8/1/202', '8/1/2026']);
  });

  it('accepts dots, dashes and spaces as separators and shows slashes', () => {
    expect(formatDateInput('8.10.2026')).toBe('8/10/2026');
    expect(formatDateInput('8-10-2026')).toBe('8/10/2026');
    expect(formatDateInput('8 10 2026')).toBe('8/10/2026');
  });

  it('drops letters and caps each part (2 / 2 / 4 digits)', () => {
    expect(formatDateInput('ab12cd')).toBe('12');
    expect(formatDateInput('08/10/2026999')).toBe('08/10/2026');
    expect(formatDateInput('1/2/3/4/5')).toBe('1/2/3'); // nothing after the year part
    expect(formatDateInput('')).toBe('');
    expect(formatDateInput('///')).toBe('');
  });

  it('digits typed after an auto-inserted slash keep flowing forward', () => {
    expect(formatDateInput('08/102')).toBe('08/10/2');
    expect(formatDateInput('081')).toBe('08/1');
    expect(formatDateInput('08/10/20261')).toBe('08/10/2026');
    expect(formatDateInput('123/456/78901')).toBe('12/34/5678'); // over-long parts spill into the next, nothing is lost silently
  });

  it('converts a pasted stored-format date, with or without a time after it', () => {
    expect(formatDateInput('2026-10-08')).toBe('08/10/2026');
    expect(formatDateInput('2026-10-08T00:00:00Z')).toBe('08/10/2026');
    expect(formatDateInput('2026-10-08T23:59:59.999+02:00')).toBe('08/10/2026');
    expect(formatDateInput('2026-10-08 14:30')).toBe('08/10/2026');
    expect(formatDateInput('  2026-10-08\n')).toBe('08/10/2026');
    expect(formatDateInput('2026-10-081')).not.toBe('08/10/2026'); // not a date followed by a time
  });

  it('backspace can remove a slash instead of fighting you', () => {
    // "08/" then the user presses backspace: the browser hands us "08"; and "08/1" -> "08/" must not re-add it
    expect(formatDateInput('08', { deleting: true })).toBe('08');
    expect(formatDateInput('08/', { deleting: true })).toBe('08');
    expect(formatDateInput('08/10/', { deleting: true })).toBe('08/10');
  });
});

describe('full-width digits (Japanese / Chinese keyboards in full-width mode)', () => {
  it('are read as ordinary digits instead of being erased', () => {
    expect(formatDateInput('０８１０２０２６')).toBe('08/10/2026');
    expect(formatDateInput('０８／１０／２０２６')).toBe('08/10/2026');
    expect(parseDateInput('０８/１０/２０２６')).toBe('2026-10-08');
    expect(parseDateInput('０８１０２０２６')).toBe('2026-10-08');
  });
});

describe('dateMatchesQuery (searching by the date you see)', () => {
  it.each([
    ['2026-03-09', '09/03', true],
    ['2026-03-09', '9/3', true], // no leading zeros needed
    ['2026-03-09', '9/3/2026', true],
    ['2026-03-09', '09/03/2026', true],
    ['2026-03-09', '03/2026', true],
    ['2026-03-09', '/2026', true],
    ['2026-03-09', '2026', true],
    ['2026-03-09', '9.3.2026', true], // dots, dashes and spaces between three parts
    ['2026-03-09', '9-3-2026', true],
    ['2026-03-09', '9 3 2026', true],
    ['2025-10-31', '31/10', true],
    ['2025-10-31', '1/10', true], // the 1 of 31 is part of "31/10": substring search, same as notes
    ['2026-03-09', '10/03', false],
    ['2026-03-09', '2026-03', false], // the hidden stored format is not something you can see or search
    ['2026-03-09', 'groceries', false],
    ['2026-03-09', '9.3', false], // two parts with a dot could be an amount: never read as a date
    ['2026-03-09', '12.5', false],
    ['nonsense', '1', false],
  ])('%s vs "%s" -> %s', (iso, q, expected) => expect(dateMatchesQuery(iso, q)).toBe(expected));

  it('an empty query matches everything', () => {
    expect(dateMatchesQuery('2026-03-09', '')).toBe(true);
    expect(dateMatchesQuery('2026-03-09', '   ')).toBe(true);
  });
});
