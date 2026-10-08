import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import MoneyInput from '../../src/components/ui/MoneyInput';

function Harness({ integer = false, initial = '' }) {
  const [v, setV] = useState(initial);
  return <MoneyInput aria-label="amount" value={v} onChange={setV} integer={integer} />;
}
const box = () => screen.getByLabelText('amount');
const paste = (text) => fireEvent.paste(box(), { clipboardData: { getData: () => text } });

describe('MoneyInput', () => {
  // Regression: a type="number" field swallowed keystrokes so nothing could be entered.
  it('accepts typing digit by digit (the original "cannot type" bug)', async () => {
    render(<Harness />);
    await userEvent.type(box(), '1234.56');
    expect(box()).toHaveValue('1234.56');
  });

  it('uses a text field with a decimal keypad, or numeric for whole numbers', () => {
    const { unmount } = render(<Harness />);
    expect(box()).toHaveAttribute('type', 'text');
    expect(box()).toHaveAttribute('inputmode', 'decimal');
    unmount();
    render(<Harness integer />);
    expect(box()).toHaveAttribute('inputmode', 'numeric');
  });

  it('filters letters, minus signs and extra decimals, and stops at two decimals', async () => {
    render(<Harness />);
    await userEvent.type(box(), 'a-1b2.3456.7');
    expect(box()).toHaveValue('12.34');
  });

  it('keeps a comma decimal as typed', async () => {
    render(<Harness />);
    await userEvent.type(box(), '12,5');
    expect(box()).toHaveValue('12,5');
  });

  it('whole-number mode rejects decimals', async () => {
    render(<Harness integer />);
    await userEvent.type(box(), '12.5');
    expect(box()).toHaveValue('125');
  });

  // Regression: pasting "1,234.56" used to become 1.23.
  it.each([
    ['1,234.56', '1234.56'],
    ['1.234,56', '1234.56'],
    ['€ 1.234,50', '1234.50'],
    ['-45,00', '45,00'],
  ])('pasting %j gives %j', (text, shown) => {
    render(<Harness />);
    paste(text);
    expect(box().value.replace(',', '.')).toBe(shown.replace(',', '.'));
  });

  it('pasting text with no number keeps what was already typed', () => {
    render(<Harness initial="42" />);
    paste('hello');
    expect(box()).toHaveValue('42');
  });

  it('a paste replaces the whole value rather than appending', () => {
    render(<Harness initial="42" />);
    paste('7.50');
    expect(box()).toHaveValue('7.50');
  });
});
