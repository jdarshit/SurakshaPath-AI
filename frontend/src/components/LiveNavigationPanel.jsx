const statusStyles = {
  idle: 'border-[var(--card-border)] bg-[#ffffff05] text-[var(--text-secondary)]',
  running: 'border-[var(--safe-green)] bg-[#22C55E15] text-[var(--safe-green)]',
  paused: 'border-[var(--medium-yellow)] bg-[#F59E0B15] text-[var(--medium-yellow)]',
  completed: 'border-[var(--primary)] bg-[#FF2D7815] text-[var(--primary)]',
  stopped: 'border-[var(--unsafe-red)] bg-[#EF444415] text-[var(--unsafe-red)]',
};

function formatTimeStamp(ts) {
  try {
    return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(ts));
  } catch { return ''; }
}

function formatProgress(progress) {
  return `${Math.max(0, Math.min(100, Math.round(progress || 0)))}%`;
}

function formatEta(minutes) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '--';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

function formatDistanceSafe(distance) {
  const val = Number(distance) || 0;
  return Number.isFinite(val) ? `${Math.max(0, val).toFixed(1)} km` : '--';
}

function formatProgressSafe(progress) {
  const val = Number(progress) || 0;
  return Number.isFinite(val) ? `${Math.max(0, Math.min(100, Math.round(val)))}%` : '--';
}

export default function LiveNavigationPanel({ navigation, route, isLiveMode = true, onToggleLiveMode, onStart, onPause, onStop }) {
  const timeline = navigation?.timeline || [];
  const summary = navigation?.summary;
  const status = navigation?.status || 'idle';
  const statusLabel = status === 'running' ? 'Live' : status === 'paused' ? 'Paused' : status === 'completed' ? 'Done' : 'Ready';

  return (
    <div className="glass-card flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="glass-card-header !mb-0">Live Navigation</h3>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${statusStyles[status] || statusStyles.idle}`}>
            {statusLabel}
          </span>
          <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <input type="checkbox" checked={isLiveMode} onChange={(e) => onToggleLiveMode?.(e.target.checked)} className="h-3 w-3 accent-[var(--primary)]" />
            GPS
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-[var(--card-border)] bg-[#ffffff02] p-2">
          <p className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">ETA</p>
          <p className="mt-1 text-[18px] font-semibold text-white leading-none">{formatEta(navigation?.etaRemaining ?? route?.estimatedTime)}</p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[#ffffff02] p-2">
          <p className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">Safety Status</p>
          <p className="mt-1 text-[12px] leading-[1.3] font-semibold text-white">{navigation?.currentSafetyStatus || 'Idle'}</p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[#ffffff02] p-2">
          <p className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">Distance</p>
          <p className="mt-1 text-[18px] font-semibold text-white leading-none">{formatDistanceSafe(navigation?.distanceRemaining ?? (Number.parseFloat(route?.distance) || 0))}</p>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-[#ffffff02] p-2">
          <p className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">Progress</p>
          <p className="mt-1 text-[18px] font-semibold text-white leading-none">{formatProgressSafe(navigation?.progress)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={onStart} className="btn-primary py-2 text-xs" disabled={!route || !isLiveMode}>
          Start Navigation
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onPause} className="btn-secondary flex-1 py-2 text-xs" disabled={!route || status === 'idle' || status === 'stopped' || status === 'completed'}>
            {status === 'paused' ? 'Resume' : 'Pause'}
          </button>
          <button type="button" onClick={onStop} className="btn-danger flex-1 py-2 text-xs" disabled={!route || status === 'idle'}>
            Stop
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-[var(--card-border)] bg-[#ffffff02] p-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-[var(--text-secondary)]">Location</span>
            <span className="text-[var(--primary)] truncate max-w-[120px]">
              {navigation?.position && Array.isArray(navigation.position) && navigation.position.length === 2 && Number.isFinite(navigation.position[0]) && Number.isFinite(navigation.position[1])
                ? `${navigation.position[0].toFixed(5)}, ${navigation.position[1].toFixed(5)}`
                : 'Waiting for GPS'}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, navigation?.progress || 0))}%` }} />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--card-border)] bg-[rgba(255,45,120,0.05)] p-3">
          <p className="text-[9px] uppercase tracking-widest text-[var(--primary)]">Next Warning Alert</p>
          <p className="mt-1 text-xs text-white leading-relaxed">{navigation?.nextWarning || 'No active alerts.'}</p>
        </div>

        {navigation?.rerouteRecommendation && (
          <div className="rounded-xl border border-[var(--medium-yellow)] bg-[#F59E0B15] p-3">
            <p className="text-[9px] uppercase tracking-widest text-[var(--medium-yellow)]">Reroute Recommended</p>
            <p className="mt-1 text-xs text-amber-50">{navigation.rerouteRecommendation}</p>
          </div>
        )}

        <div className="rounded-xl border border-[var(--card-border)] bg-[#ffffff02] p-3">
          <p className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)] mb-2">Timeline</p>
          <div className="space-y-2">
            {timeline.length ? timeline.slice(-4).map((item) => (
              <div key={item.id} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-white">{item.label}</p>
                  <p className="text-[10px] text-[var(--text-secondary)] truncate">{item.detail}</p>
                </div>
                <span className="text-[9px] text-[var(--text-secondary)]">{formatTimeStamp(item.time)}</span>
              </div>
            )) : <p className="text-xs text-[var(--text-secondary)]">No events yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
