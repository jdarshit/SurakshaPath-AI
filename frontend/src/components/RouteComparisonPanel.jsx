import { useState } from 'react';

const viewModes = [
  { id: 'ai', label: 'AI View' },
  { id: 'technical', label: 'Technical' },
];

const riskBarLabels = {
  crime_risk: 'Crime Risk',
  lighting_quality: 'Lighting',
  women_safety: 'Women Safety',
  cctv_coverage: 'CCTV',
  police_accessibility: 'Police',
};

function clamp(value, min = 0, max = 100) {
  const num = Number(value) || 0;
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : 0;
}

function parseRouteTime(route) {
  const val = Number.parseFloat(route?.estimatedTime) || 0;
  return Number.isFinite(val) ? val : 0;
}

function formatSignedPercent(value) {
  const num = Number(value) || 0;
  const rounded = Number.isFinite(num) ? Math.round(num) : 0;
  return `${rounded >= 0 ? '+' : ''}${rounded}%`;
}

function getBadgeStyle(label) {
  if (label.includes('Safest') || label.includes('Recommended')) return 'border-[var(--safe-green)] bg-[#22C55E15] text-[var(--safe-green)]';
  if (label.includes('Fastest')) return 'border-[#38BDF8] bg-[#38BDF815] text-[#38BDF8]';
  if (label.includes('High Risk')) return 'border-[var(--unsafe-red)] bg-[#EF444415] text-[var(--unsafe-red)]';
  if (label.includes('Night')) return 'border-[#A855F7] bg-[#A855F715] text-[#A855F7]';
  return 'border-[var(--card-border)] bg-[#ffffff05] text-[var(--text-secondary)]';
}

function getRiskTint(score) {
  if (score >= 75) return 'from-[var(--safe-green)] to-[#38BDF8]';
  if (score >= 50) return 'from-[var(--medium-yellow)] to-[#FB923C]';
  return 'from-[var(--unsafe-red)] to-[#F43F5E]';
}

function getRouteNarrative(route) {
  return route?.prediction?.route_recommendation_text || route?.prediction?.ai_summary || 'AI explanation unavailable for this route.';
}

function getPositiveLabels(route) {
  return (route?.prediction?.positive_factors || []).slice(0, 3).map((item) => item.label || item);
}

function getNegativeLabels(route) {
  return (route?.prediction?.negative_factors || []).slice(0, 3).map((item) => item.label || item);
}

export default function RouteComparisonPanel({ routes = [], activeRouteId = null, onSelectRoute }) {
  const [viewMode, setViewMode] = useState('ai');

  if (!routes.length) return null;

  // Find safest and fastest routes from the sorted list
  const safestRoute = routes.find(r => r.isSafestRoute) || routes[0];
  const fastestRoute = routes.find(r => r.isFastestRoute) || routes[0];
  const activeRoute = routes.find((route) => route.id === activeRouteId) || safestRoute;
  
  console.log('[RouteComparison] Panel state:', {
    totalRoutes: routes.length,
    activeRouteId,
    safestRouteName: safestRoute?.name,
    safestScore: safestRoute?.safetyScore,
  });

  const isActive = activeRoute;
  const riskLevel = activeRoute.prediction?.risk_level || 'moderate';
  const routeNarrative = getRouteNarrative(activeRoute);
  const positiveFactors = getPositiveLabels(activeRoute);
  const negativeFactors = getNegativeLabels(activeRoute);
  const riskBreakdown = activeRoute.prediction?.risk_breakdown || {};

  return (
    <div className="glass-card flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--card-border)] pb-3">
        <h3 className="glass-card-header !mb-0">AI Explainability</h3>
        <div className="flex bg-[#ffffff05] rounded-full p-1 border border-[var(--card-border)]">
          {viewModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setViewMode(mode.id)}
              className={`rounded-full px-3 py-1 text-[10px] font-semibold transition ${
                viewMode === mode.id
                  ? 'bg-[var(--primary)] text-white shadow-glow'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1 border-b border-[var(--card-border)] pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
           <h4 className="text-base font-semibold text-white">{activeRoute.name}</h4>
           <div className="text-right">
              <span className="text-xl font-bold" style={{ color: 'var(--primary)' }}>{activeRoute.safetyScore}</span>
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] ml-1">Score</span>
           </div>
        </div>
        <p className="text-[11px] text-[var(--text-secondary)]">
          {activeRoute.distance} · {activeRoute.estimatedTime} · {Math.round((activeRoute.prediction?.confidence || 0) * 100)}% Conf
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ffffff10]">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${getRiskTint(activeRoute.safetyScore)} transition-all duration-500`}
            style={{ width: `${clamp(activeRoute.safetyScore)}%` }}
          />
        </div>
      </div>

      {viewMode === 'ai' && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-[#22C55E30] bg-[#22C55E05] p-3">
            <p className="text-[9px] uppercase tracking-widest text-[var(--safe-green)]">Top Positive Factors</p>
            <ul className="mt-2 space-y-1.5 text-[11px] text-[#22C55E]">
              {positiveFactors.length ? positiveFactors.map((label) => <li key={label}>✓ {label}</li>) : <li>✓ Balanced signals across the route</li>}
            </ul>
          </div>
          
          <div className="rounded-xl border border-[#EF444430] bg-[#EF444405] p-3">
            <p className="text-[9px] uppercase tracking-widest text-[var(--unsafe-red)]">Top Negative Factors</p>
            <ul className="mt-2 space-y-1.5 text-[11px] text-[#EF4444]">
              {negativeFactors.length ? negativeFactors.map((label) => <li key={label}>⚠ {label}</li>) : <li>⚠ No dominant negative factor found</li>}
            </ul>
          </div>

          <div className="rounded-xl border border-[var(--card-border)] bg-[#ffffff05] p-3">
            <p className="text-[9px] uppercase tracking-widest text-[var(--primary)] mb-1.5">AI Summary</p>
            <p className="text-[11px] leading-relaxed text-white">{routeNarrative}</p>
          </div>
        </div>
      )}

      {viewMode === 'technical' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            <p className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">Risk Breakdown</p>
            {Object.entries(riskBreakdown).map(([key, value]) => (
              <div key={key}>
                <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mb-1">
                  <span>{riskBarLabels[key] || key}</span>
                  <span>{value}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#ffffff10]">
                  <div className="h-full rounded-full bg-gradient-to-r from-[var(--safe-green)] to-[var(--unsafe-red)]" style={{ width: `${clamp(value)}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">Feature Impact</p>
            <div className="flex flex-col gap-1.5">
              {(activeRoute.prediction?.feature_importance || []).slice(0, 4).map((item) => (
                <div key={item.feature || item.label} className="flex flex-col gap-0.5 rounded border border-[#ffffff05] bg-[#ffffff02] p-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white">{item.label}</span>
                    <span className={item.direction === 'positive' ? 'text-[var(--safe-green)]' : item.direction === 'negative' ? 'text-[var(--unsafe-red)]' : 'text-[var(--text-secondary)]'}>
                      {formatSignedPercent((item.contribution || 0) * 100)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}