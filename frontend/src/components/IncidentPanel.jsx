import { useMemo } from 'react';
import { normalizeSeverityKey } from '../utils/severity';
import { getFriendlyIncidentType, getFriendlyDescription, getLocationLabel } from '../utils/incidentDisplay';

const SEVERITY_CONFIG = {
  HIGH: { badge: '🔴', color: 'text-[var(--unsafe-red)]', bg: 'bg-[#EF444415]' },
  MEDIUM: { badge: '🟠', color: 'text-[var(--medium-yellow)]', bg: 'bg-[#F59E0B15]' },
  LOW: { badge: '🟡', color: 'text-[var(--safe-green)]', bg: 'bg-[#22C55E15]' },
  UNKNOWN: { badge: '⚪', color: 'text-[var(--text-secondary)]', bg: 'bg-[#94A3B815]' },
};

export default function IncidentPanel({ incidents = [], isLoading = false }) {
  const sortedIncidents = useMemo(
    () => [...incidents].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [incidents]
  );

  const timeAgo = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="glass-card flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-2">
        <div>
          <h3 className="glass-card-header !mb-0">Recent Incidents</h3>
          <p className="mt-1 text-[9px] text-[var(--text-secondary)]">Live Safety Reports</p>
        </div>
        <div className="rounded-full border border-[var(--unsafe-red)] bg-[#EF444415] px-2 py-0.5 text-[9px] font-bold text-[var(--unsafe-red)] uppercase tracking-wider">
          {incidents.length} reports
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--text-secondary)] border-t-[var(--primary)]" />
          <span className="ml-2 text-[10px] text-[var(--text-secondary)]">Loading incidents...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && sortedIncidents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="text-2xl mb-1 text-[var(--safe-green)]">✅</div>
          <p className="text-[11px] font-medium text-[var(--text-secondary)]">No incidents reported</p>
          <p className="text-[9px] text-[var(--text-secondary)] mt-0.5 opacity-70">Stay safe out there!</p>
        </div>
      )}

      {/* Incidents List */}
      {!isLoading && sortedIncidents.length > 0 && (
        <div className="flex flex-col gap-2 max-h-[calc(100vh-16rem)] overflow-y-auto custom-scrollbar pr-1">
          {sortedIncidents.map((incident) => {
            const severityKey = normalizeSeverityKey(incident?.severity);
            const severity = severityKey.toLowerCase();
            const config = SEVERITY_CONFIG[severityKey] || SEVERITY_CONFIG.UNKNOWN;

            return (
              <div
                key={incident.id}
                className="rounded-xl border border-[var(--card-border)] bg-[#ffffff02] p-2.5 transition hover:bg-[#ffffff05]"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex flex-col">
                    <p className="text-[11px] font-semibold text-white">{getFriendlyIncidentType(incident?.incident_type)}</p>
                    <p className="text-[9px] text-[var(--text-secondary)]">{incident?.area_name || 'Unknown area'}</p>
                  </div>
                  <div className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${config.bg} ${config.color}`}>
                    {config.badge} {severity}
                  </div>
                </div>

                {/* Description */}
                {incident.description && (
                  <p className="text-[10px] leading-relaxed text-[#D1D5DB] mb-1.5 line-clamp-2">{getFriendlyDescription(incident.description)}</p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between text-[9px] text-[var(--text-secondary)]">
                  <span className="opacity-70">📍 {getLocationLabel(incident)}</span>
                  <span>{timeAgo(incident?.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
