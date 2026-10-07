import { useEffect, useState } from 'react';
import { todayISO } from '../utils/dates';

/**
 * Today's date as 'YYYY-MM-DD', refreshed when the window regains focus and once a
 * minute. Without this, an installed PWA left open past midnight (or month end)
 * would keep showing the previous day's / month's budgets and due dates.
 * Returns the same string until the day changes, so it causes no extra renders.
 */
export function useToday() {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const refresh = () => setToday(todayISO());
    const id = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return today;
}
