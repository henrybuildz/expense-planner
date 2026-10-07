// Income / Expense segmented control shared by the entry form and calculator.
export default function TypeToggle({ value, onChange, name = 'type' }) {
  const option = (id, label, active) => (
    <label
      className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium transition focus-within:ring-2 focus-within:ring-emerald-500/50 ${
        value === id ? active : 'text-slate-600 hover:bg-white/60'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={id}
        checked={value === id}
        onChange={() => onChange(id)}
        className="sr-only"
      />
      {label}
    </label>
  );
  return (
    <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup">
      {option('expense', 'Expense', 'bg-rose-500 text-white shadow-sm')}
      {option('income', 'Income', 'bg-emerald-600 text-white shadow-sm')}
    </div>
  );
}
