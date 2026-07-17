const routeItems = [
  { label: 'Safe', color: 'bg-safe', text: 'text-emerald-300' },
  { label: 'Medium', color: 'bg-caution', text: 'text-amber-300' },
  { label: 'Unsafe', color: 'bg-danger', text: 'text-red-300' },
];

const zoneItems = [
  { emoji: '🟢', label: 'Safe Zone', color: '#10b981', score: '70-100' },
  { emoji: '🟡', label: 'Medium Zone', color: '#f59e0b', score: '40-69' },
  { emoji: '🔴', label: 'Unsafe Zone', color: '#ef4444', score: '0-39' },
];

/**
 * SafetyLegend - Displays legend for routes and safety zones
 * Can be used as a sidebar panel or floating map legend
 */
export default function SafetyLegend({ isMapOverlay = false }) {
  if (isMapOverlay) {
    return (
      <div className="leaflet-control" style={{
        background: 'rgba(2, 8, 23, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        padding: '12px',
        maxWidth: '180px',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ fontSize: '11px', fontWeight: '600', color: 'rgb(148, 163, 184)', marginBottom: '8px' }}>Safety Legend</div>

        {/* Zone Legend */}
        <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
          {zoneItems.map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'rgb(203, 213, 225)', marginBottom: '4px' }}>
              <span>{item.emoji}</span>
              <span style={{ fontWeight: '500' }}>{item.label}</span>
              <span style={{ color: 'rgb(100, 116, 139)' }}>({item.score})</span>
            </div>
          ))}
        </div>

        {/* Route Legend */}
        <div>
          {routeItems.map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'rgb(203, 213, 225)', marginBottom: '4px' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: item.color.includes('safe') ? '#10b981' : item.color.includes('caution') ? '#f59e0b' : '#ef4444' }} />
              <span style={{ fontWeight: '500' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Sidebar panel version
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-glow backdrop-blur-xl">
      <p className="text-sm font-medium text-slate-300">Safety Legend</p>

      {/* Zone Legend */}
      <div className="mt-4">
        <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-2">Safety Zones</p>
        <div className="space-y-2">
          {zoneItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-2">
              <span className={`h-3 w-3 rounded-full`} style={{ backgroundColor: item.color }} />
              <div>
                <span className="text-xs font-medium text-slate-300">{item.label}</span>
                <span className="text-xs text-slate-500 ml-1">({item.score})</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Route Legend */}
      <div className="mt-4">
        <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-2">Route Safety</p>
        <div className="space-y-2">
          {routeItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-2">
              <span className={`h-3 w-3 rounded-full ${item.color} shadow-[0_0_0_4px_rgba(255,255,255,0.04)]`} />
              <span className={`text-xs font-medium ${item.text}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}