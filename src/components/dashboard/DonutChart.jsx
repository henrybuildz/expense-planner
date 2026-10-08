import { categoryMeta } from '../../constants/categories';
import { formatMoney } from '../../utils/format';

// Pure-SVG donut. The circle radius is 100/(2π) so circumference = 100 and
// each segment's dash length equals its percentage.
const R = 15.9155;

export default function DonutChart({ segments, total }) {
  // The hole is about 6.5rem wide: shrink the figure for long totals so it never runs over the ring.
  const shown = formatMoney(total);
  const size = shown.length > 12 ? 'text-xs' : shown.length > 9 ? 'text-sm' : 'text-base';
  let offset = 0;
  return (
    <div className="relative h-44 w-44 shrink-0">
      <svg
        viewBox="0 0 42 42"
        className="h-full w-full -rotate-90"
        role="img"
        aria-label={`Spending by category, total ${formatMoney(total)}`}
      >
        <circle cx="21" cy="21" r={R} fill="none" stroke="#e2e8f0" strokeWidth="5" />
        {segments.map((s) => {
          const circle = (
            <circle
              key={s.name}
              cx="21"
              cy="21"
              r={R}
              fill="none"
              stroke={categoryMeta(s.name).color}
              strokeWidth="5"
              strokeDasharray={`${s.pct} ${100 - s.pct}`}
              strokeDashoffset={-offset}
            >
              <title>{`${s.name}: ${formatMoney(s.amount)}`}</title>
            </circle>
          );
          offset += s.pct;
          return circle;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-slate-500">Spent</span>
        <span className={`${size} font-semibold tabular-nums`}>{shown}</span>
      </div>
    </div>
  );
}
