import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import WeekSummary from '../../src/components/dashboard/WeekSummary';

const today = '2026-10-08'; // a Thursday: the week is 05/10 - 11/10
const t = (id, amount, type = 'expense') => ({ id, type, amount, category: 'Food', date: '2026-10-07', notes: '' });
const grid = () => screen.getByText('Income').parentElement.parentElement;

describe('WeekSummary on a phone', () => {
  it('puts the three figures side by side when they are short', () => {
    render(<WeekSummary transactions={[t('a', 234.5), t('b', 100, 'income')]} today={today} />);
    expect(grid().className).toContain('grid-cols-3');
    expect(grid().className).not.toContain('grid-cols-1');
  });

  it('stacks them when one is long enough to be squeezed (10,000.00 and up), so nothing overlaps', () => {
    render(<WeekSummary transactions={[t('a', 12000)]} today={today} />);
    expect(grid().className).toContain('grid-cols-1');
  });
});
