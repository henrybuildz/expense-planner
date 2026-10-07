import { cleanNumberText, normalizePastedAmount } from '../../utils/format';

// Plain text field for amounts. type="number" behaves differently across Safari / Firefox / iOS and
// comma-decimal locales (it can swallow keystrokes or clear the field), so we use text with a
// numeric keypad (inputMode) and clean the text ourselves. `onChange` receives the cleaned string.
export default function MoneyInput({ value, onChange, integer = false, ...rest }) {
  // A paste replaces the whole value and understands thousands separators ("1,234.56" -> 1234.56).
  const handlePaste = (e) => {
    const text = e.clipboardData && e.clipboardData.getData('text');
    if (!text) return;
    e.preventDefault();
    const cleaned = cleanNumberText(integer ? text : normalizePastedAmount(text), { integer });
    if (cleaned) onChange(cleaned); // pasting something non-numeric must not wipe what is already typed
  };

  return (
    <input
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(cleanNumberText(e.target.value, { integer }))}
      onPaste={handlePaste}
      {...rest}
    />
  );
}
