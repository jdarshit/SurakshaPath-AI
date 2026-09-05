const styleByColor = {
  safe: 'border-[var(--safe-green)] bg-[#22C55E15] text-[var(--safe-green)]',
  caution: 'border-[var(--medium-yellow)] bg-[#F59E0B15] text-[var(--medium-yellow)]',
  danger: 'border-[var(--unsafe-red)] bg-[#EF444415] text-[var(--unsafe-red)]',
};

export default function RouteCard({ route, active, onClick, isRecommended = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)] hover:bg-[#FF2D7805] ${
        active ? 'border-[var(--primary)] bg-[#FF2D7810] shadow-[0_0_15px_rgba(255,45,120,0.15)]' : 'border-[var(--card-border)] bg-[#ffffff02]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-semibold text-white">{route.name}</p>
            {route.isSafestRoute && (
              <span className="inline-block rounded-full bg-[#22C55E20] px-2 py-0.5 text-[9px] font-bold text-[#22C55E] uppercase tracking-wider border border-[#22C55E]">
                🛡 Safest
              </span>
            )}
            {route.isFastestRoute && (
              <span className="inline-block rounded-full bg-[#3B82F620] px-1.5 py-0.5 text-[9px] font-bold text-[#60A5FA] uppercase tracking-wider border border-[#60A5FA]">
                ⚡ Fastest
              </span>
            )}
            {isRecommended && !route.isSafestRoute && !route.isFastestRoute && (
              <span className="inline-block rounded-full bg-[#F59E0B20] px-1.5 py-0.5 text-[9px] font-bold text-[var(--medium-yellow)] uppercase tracking-wider border border-[var(--medium-yellow)]">
                ⭐ Rec
              </span>
            )}
          </div>
          <p className="text-[10px] text-[var(--text-secondary)]">
            {route.distance} · {route.estimatedTime}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${styleByColor[route.color] || styleByColor.safe}`}>
            {route.safetyScore}
          </span>
        </div>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#ffffff10]">
        <div
          className={`h-full rounded-full ${route.color === 'safe' ? 'bg-[var(--safe-green)]' : route.color === 'caution' ? 'bg-[var(--medium-yellow)]' : 'bg-[var(--unsafe-red)]'}`}
          style={{ width: `${route.safetyScore}%` }}
        />
      </div>
      
      {route.smartBadges?.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {route.smartBadges.map((badge) => (
            <span key={badge} className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[9px] text-white tracking-widest uppercase">
              {badge}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}