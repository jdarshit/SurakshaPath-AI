/**
 * InsightCard - Display AI-generated insights
 */
export default function InsightCard({ icon = '💡', title, description, trend = null, trendValue = 0 }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-white/2 p-6 backdrop-blur-lg hover:border-white/20 transition">
      <div className="flex items-start gap-4">
        <div className="text-3xl">{icon}</div>
        <div className="flex-1">
          <h4 className="font-semibold text-white">{title}</h4>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed">{description}</p>
          {trend && (
            <div className={`mt-3 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
              trend === 'up'
                ? 'bg-red-500/20 text-red-300'
                : 'bg-emerald-500/20 text-emerald-300'
            }`}>
              {trend === 'up' ? '📈' : '📉'} {Math.abs(trendValue)}% {trend === 'up' ? 'increase' : 'decrease'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
