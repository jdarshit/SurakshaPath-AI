/**
 * MapControls - Toggle buttons for showing/hiding map layers
 */
export default function MapControls({
  showRoutes,
  showSafetyZones,
  onToggleRoutes,
  onToggleSafetyZones,
  onToggleBoth,
}) {
  return (
    <div className="absolute right-4 top-4 z-40 flex flex-col gap-2">
      {/* Individual toggle buttons */}
      <div className="flex gap-2 rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur-lg p-2">
        <button
          type="button"
          onClick={onToggleRoutes}
          title="Toggle route display"
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
            showRoutes
              ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50'
              : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
          }`}
        >
          🛣️ Routes
        </button>

        <button
          type="button"
          onClick={onToggleSafetyZones}
          title="Toggle safety zones display"
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
            showSafetyZones
              ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/50'
              : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
          }`}
        >
          📍 Zones
        </button>
      </div>

      {/* Quick toggle "Both" button */}
      <button
        type="button"
        onClick={onToggleBoth}
        title="Show both routes and safety zones"
        className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 backdrop-blur-lg"
      >
        👁️ Show Both
      </button>
    </div>
  );
}
