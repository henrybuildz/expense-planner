import { formatMoney } from '../../utils/format';

// Grouped income/expense bars in plain SVG.
const W = 360;
const H = 170;
const PAD_BOTTOM = 22;
const PLOT_H = H - PAD_BOTTOM - 8;

export default function MonthlyBars({ months }) {
  const peak = Math.max(0, ...months.flatMap((m) => [m.income, m.expense]));
  const max = Math.max(1, peak); // the bars scale to this; 1 only avoids dividing by zero when there is no data
  const slot = W / months.length;
  const barW = Math.min(18, slot / 3);
  const y = (v) => 8 + PLOT_H - (v / max) * PLOT_H;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto h-auto max-h-80 w-full"
        aria-hidden="true"
      >
        <line x1="0" x2={W} y1={8 + PLOT_H} y2={8 + PLOT_H} stroke="#e2e8f0" />
        {months.map((m, i) => {
          const cx = slot * i + slot / 2;
          return (
            <g key={m.key}>
              <rect
                x={cx - barW - 1}
                y={y(m.income)}
                width={barW}
                height={8 + PLOT_H - y(m.income)}
                rx="3"
                fill="#10b981"
              >
                <title>{`${m.label} income: ${formatMoney(m.income)}`}</title>
              </rect>
              <rect
                x={cx + 1}
                y={y(m.expense)}
                width={barW}
                height={8 + PLOT_H - y(m.expense)}
                rx="3"
                fill="#f43f5e"
              >
                <title>{`${m.label} expenses: ${formatMoney(m.expense)}`}</title>
              </rect>
              <text x={cx} y={H - 6} textAnchor="middle" fontSize="11" fill="#64748b">
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>Income and expenses by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Income</th>
            <th scope="col">Expenses</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.key}>
              <th scope="row">{m.label}</th>
              <td>{formatMoney(m.income)}</td>
              <td>{formatMoney(m.expense)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex justify-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Expenses
        </span>
        {/* The tallest bar, so the heights mean something. Hidden when there is nothing to scale to. */}
        {peak > 0 && <span>Tallest bar: {formatMoney(peak)}</span>}
      </div>
    </div>
  );
}
