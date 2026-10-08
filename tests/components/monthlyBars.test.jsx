import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MonthlyBars from '../../src/components/dashboard/MonthlyBars';

const month = (key, income, expense) => ({ key, label: key, income, expense });

describe('MonthlyBars', () => {
  it('names the tallest bar, and does not invent a scale when there is no data', () => {
    const { rerender } = render(<MonthlyBars months={[month('May', 0, 0), month('Jun', 0, 0)]} />);
    expect(screen.queryByText(/tallest bar/i)).not.toBeInTheDocument(); // used to claim a scale of 1.00
    rerender(<MonthlyBars months={[month('May', 100, 40), month('Jun', 20, 250)]} />);
    expect(screen.getByText(/tallest bar: €250\.00/i)).toBeInTheDocument();
  });

  it('gives screen readers the values as a table (the SVG itself is hidden)', () => {
    render(<MonthlyBars months={[month('May', 100, 40)]} />);
    expect(screen.getByRole('table')).toHaveTextContent('€100.00');
    expect(screen.getByRole('table')).toHaveTextContent('€40.00');
  });
});
