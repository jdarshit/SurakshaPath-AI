/**
 * MetricCard - Reusable animated metric display component
 */
export default function MetricCard({ icon, label, value, change, color = 'cyan' }) {
  const colorMap = {
    cyan: {
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
      text: 'text-cyan-400',
      icon: 'text-cyan-500',
    },
    emerald: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
      icon: 'text-emerald-500',
    },
    amber: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      text: 'text-amber-400',
      icon: 'text-amber-500',
    },
    red: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      text: 'text-red-400',
      icon: 'text-red-500',
    },
  };

  const colors = colorMap[color] || colorMap.cyan;

  return (
    <div
      className={`rounded-3xl border ${colors.bg} ${colors.border} p-6 backdrop-blur-lg transition hover:border-opacity-50`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-400 font-medium">{label}</p>
          <p className={`mt-2 text-3xl font-bold ${colors.text}`}>{value}</p>
          {change && (
            <p className={`mt-2 text-xs ${change > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {change > 0 ? '↑' : '↓'} {Math.abs(change)}% from last week
            </p>
          )}
        </div>
        <div className={`text-3xl ${colors.icon}`}>{icon}</div>
      </div>
    </div>
  );
}
