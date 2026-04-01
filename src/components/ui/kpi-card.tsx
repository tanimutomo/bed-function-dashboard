interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  description?: string;
}

export function KpiCard({ label, value, unit, description }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">
        {typeof value === "number" ? value.toLocaleString() : value}
        {unit && <span className="ml-1 text-lg text-gray-500">{unit}</span>}
      </p>
      {description && (
        <p className="mt-1 text-xs text-gray-400">{description}</p>
      )}
    </div>
  );
}
