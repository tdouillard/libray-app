interface StatsCardProps {
  label: string;
  value: string;
  detail: string;
}

export function StatsCard({ label, value, detail }: StatsCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{detail}</span>
      </div>
    </div>
  );
}
