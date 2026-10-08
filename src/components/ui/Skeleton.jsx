// Placeholder shapes shown while data from the account is on its way. Purely decorative: the wrapper
// announces "Loading" once to screen readers and the shapes themselves are hidden from them.
export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`skeleton rounded-md bg-slate-200 ${className}`} />;
}

function Loading({ label, className = '', children }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

// A list of rows: icon, two lines of text, an amount on the right.
export function SkeletonRows({ rows = 5, label = 'Loading your data' }) {
  return (
    <Loading label={label}>
      <ul className="divide-y divide-slate-100">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center gap-3 py-3">
            <Skeleton className="h-9 w-9 shrink-0 !rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-4 w-16" />
          </li>
        ))}
      </ul>
    </Loading>
  );
}

// Cards in a grid (budgets).
export function SkeletonCards({ count = 3, label = 'Loading your data' }) {
  return (
    <Loading label={label} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card space-y-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-2.5 w-full !rounded-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </Loading>
  );
}

// The dashboard: four metric cards and two panels.
export function SkeletonDashboard({ label = 'Loading your data' }) {
  return (
    <Loading label={label} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card space-y-3">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card"><Skeleton className="h-48 w-full" /></div>
        <div className="card"><Skeleton className="h-48 w-full" /></div>
      </div>
    </Loading>
  );
}

// The account card in Settings while the saved login is being checked.
export function SkeletonAccount() {
  return (
    <Loading label="Checking your account" className="card space-y-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-9 w-40" />
    </Loading>
  );
}
