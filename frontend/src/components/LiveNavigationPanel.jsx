import { useEffect, useRef, useState } from 'react';
import { reverseGeocodeWithCache } from '../services/locationSearch';

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

function formatTimeStamp(ts) {
  try {
    return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(ts));
  } catch { return ''; }
}

// Free-text zone labels (e.g. "High risk", "Well lit", "Medium risk") ->
// a chip color. Purely a display-layer classification, doesn't touch how
// these labels are generated (services/navigation.js deriveNavigationAlert).
function classifySafety(label) {
  const text = String(label || '').toLowerCase();
  if (!text || text.includes('idle') || text.includes('awaiting') || text === 'unknown') {
    return { key: 'idle', className: 'border-[var(--card-border)] bg-[#ffffff05] text-[var(--text-secondary)]' };
  }
  if (text.includes('unsafe') || text.includes('high risk') || text.includes('dynamic risk')) {
    return { key: 'unsafe', className: 'border-[var(--unsafe-red)] bg-[#EF444420] text-[var(--unsafe-red)]' };
  }
  if (text.includes('medium')) {
    return { key: 'medium', className: 'border-[var(--medium-yellow)] bg-[#F59E0B20] text-[var(--medium-yellow)]' };
  }
  return { key: 'safe', className: 'border-[var(--safe-green)] bg-[#22C55E20] text-[var(--safe-green)]' };
}

/**
 * Compact overlay bar (Google Maps style) for live navigation, docked above
 * the bottom nav instead of a full-height card splitting the map. Tapping
 * the expand toggle reveals a capped-height bottom sheet with the rest of
 * the detail; it never grows to cover the whole map.
 *
 * All navigation math/state (progress, ETA, alerts, GPS tracking) is
 * computed entirely in Home.jsx and passed in via props - this component
 * only decides how to lay it out and adds a display-only reverse-geocoded
 * location label.
 */
export default function LiveNavigationPanel({ navigation, route, isLiveMode = true, onToggleLiveMode, onStart, onPause, onStop }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [positionLabel, setPositionLabel] = useState('');
  const lastGeocodedKeyRef = useRef('');

  const timeline = navigation?.timeline || [];
  const status = navigation?.status || 'idle';
  const position = navigation?.position;
  const hasValidPosition = Array.isArray(position) && position.length === 2 && Number.isFinite(position[0]) && Number.isFinite(position[1]);
  const nextWarning = navigation?.nextWarning;
  const hasWarning = Boolean(nextWarning) && nextWarning !== 'No active alerts.' && nextWarning !== 'Start navigation to receive live alerts.';

  // Display-only: resolve the current GPS position to a nearby place name
  // instead of showing raw coordinates. Cached/throttled by key so this
  // doesn't fire on every animation-frame position tween, only on
  // meaningfully new coordinates (~11m grid via 4-decimal rounding).
  useEffect(() => {
    if (!hasValidPosition) {
      setPositionLabel('');
      return undefined;
    }

    const key = `${position[0].toFixed(4)},${position[1].toFixed(4)}`;
    if (key === lastGeocodedKeyRef.current) return undefined;
    lastGeocodedKeyRef.current = key;

    let cancelled = false;
    reverseGeocodeWithCache(position[0], position[1])
      .then((name) => {
        if (!cancelled && name) setPositionLabel(name);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [hasValidPosition, position?.[0], position?.[1]]);

  // Reset the dismissed-warning flag whenever a genuinely new warning comes in.
  useEffect(() => {
    setWarningDismissed(false);
  }, [nextWarning]);

  // Nothing to show until there's a route to navigate.
  if (!route && status === 'idle') return null;

  const safetyChip = classifySafety(navigation?.currentSafetyStatus);
  const isRunning = status === 'running' || status === 'paused';

  return (
    <>
      {/* Warning strip - only surfaces while the sheet is collapsed, so a
          real safety warning is never missed just because the user hasn't
          opened the panel. */}
      {!isExpanded && isRunning && hasWarning && !warningDismissed && (
        <div
          className="pointer-events-auto fixed bottom-[176px] left-3 z-[1150] mx-auto max-w-[680px]"
          style={{ right: '116px' }}
        >
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="flex w-full items-center gap-2 rounded-2xl border border-[var(--medium-yellow)] bg-[#12121A]/95 px-4 py-2.5 text-left text-xs text-amber-100 shadow-lg backdrop-blur-xl"
          >
            <span className="shrink-0">⚠️</span>
            <span className="flex-1 truncate">{nextWarning}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); setWarningDismissed(true); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setWarningDismissed(true); } }}
              className="shrink-0 rounded-full px-1.5 text-[var(--text-secondary)] hover:text-white"
              aria-label="Dismiss warning"
            >
              ✕
            </span>
          </button>
        </div>
      )}

      {/* Expanded bottom sheet - capped height, never covers the full map. */}
      {isExpanded && (
        <div
          className="pointer-events-auto fixed bottom-[76px] left-3 z-[1150] mx-auto flex max-h-[45vh] max-w-[680px] flex-col gap-3 overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-[#12121A]/95 p-4 shadow-2xl backdrop-blur-xl"
          style={{ right: '116px' }}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="glass-card-header !mb-0">Live Navigation</h3>
            <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              <input type="checkbox" checked={isLiveMode} onChange={(e) => onToggleLiveMode?.(e.target.checked)} className="h-3 w-3 accent-[var(--primary)]" />
              GPS
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <button type="button" onClick={onStart} className="btn-primary py-2 text-xs" disabled={!route || !isLiveMode || isRunning}>
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

          <div className="rounded-xl border border-[var(--card-border)] bg-[#ffffff02] p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[var(--text-secondary)]">Location</span>
              <span className="text-[var(--primary)] truncate max-w-[65%] text-right">
                {hasValidPosition ? (positionLabel || 'Locating…') : 'Waiting for GPS'}
              </span>
            </div>
            {hasValidPosition && (
              <p className="mt-1 text-right text-[9px] text-[var(--text-secondary)] opacity-60">
                {position[0].toFixed(5)}, {position[1].toFixed(5)}
              </p>
            )}
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
      )}

      {/* Compact bar - always the default state, docked above the bottom
          nav, never covering the map. Progress is shown both as a number
          and as a thin fill bar along the bottom edge, since the number
          alone doesn't reliably fit alongside everything else on a narrow
          phone once the SOS button's corner is reserved. */}
      <div
        className="pointer-events-auto fixed bottom-4 left-3 z-[1150] mx-auto max-w-[680px] overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[#12121A]/90 shadow-lg backdrop-blur-xl"
        style={{ right: '116px' }}
      >
        <div className="flex items-center gap-1.5 px-2.5 py-2 sm:gap-2.5 sm:px-4">
          <div className="min-w-0 shrink-0">
            <p className="text-[7px] uppercase tracking-widest text-[var(--text-secondary)] sm:text-[8px]">ETA</p>
            <p className="text-[12px] font-semibold leading-tight text-white sm:text-[13px]">{formatEta(navigation?.etaRemaining ?? route?.estimatedTime)}</p>
          </div>
          <div className="min-w-0 shrink-0">
            <p className="text-[7px] uppercase tracking-widest text-[var(--text-secondary)] sm:text-[8px]">Dist</p>
            <p className="text-[12px] font-semibold leading-tight text-white sm:text-[13px]">{formatDistanceSafe(navigation?.distanceRemaining ?? (Number.parseFloat(route?.distance) || 0))}</p>
          </div>
          <span className={`min-w-0 shrink truncate rounded-full border px-1.5 py-1 text-[8px] font-semibold uppercase tracking-wider sm:px-2 sm:text-[9px] ${safetyChip.className}`}>
            {navigation?.currentSafetyStatus || 'Idle'}
          </span>
          <span className="hidden shrink-0 text-[10px] font-semibold text-[var(--text-secondary)] sm:inline">
            {formatProgressSafe(navigation?.progress)}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-label={isExpanded ? 'Collapse navigation panel' : 'Expand navigation panel'}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--card-border)] bg-[#ffffff05] text-xs text-[var(--text-secondary)] transition hover:text-white sm:h-8 sm:w-8"
            >
              {isExpanded ? '▼' : '▲'}
            </button>
            {isRunning ? (
              <button type="button" onClick={onStop} className="btn-danger shrink-0 whitespace-nowrap px-2.5 py-1.5 text-[10px] sm:px-3 sm:text-[11px]">
                Stop
              </button>
            ) : (
              <button type="button" onClick={onStart} disabled={!route || !isLiveMode} className="btn-primary shrink-0 whitespace-nowrap px-2.5 py-1.5 text-[10px] sm:px-3 sm:text-[11px]">
                Start
              </button>
            )}
          </div>
        </div>
        <div className="h-1 w-full bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] transition-all duration-500"
            style={{ width: `${Math.max(0, Math.min(100, navigation?.progress || 0))}%` }}
          />
        </div>
      </div>
    </>
  );
}
