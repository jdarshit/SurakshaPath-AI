import { useEffect, useState } from 'react';
import { normalizeSeverityKey } from '../utils/severity';

const SEVERITY_CONFIG = {
  HIGH: { badge: '🔴', color: 'text-red-300', bg: 'bg-red-500/10' },
  MEDIUM: { badge: '🟠', color: 'text-orange-300', bg: 'bg-orange-500/10' },
  LOW: { badge: '🟡', color: 'text-yellow-300', bg: 'bg-yellow-500/10' },
  UNKNOWN: { badge: '⚪', color: 'text-slate-400', bg: 'bg-slate-500/10' },
};

/**
 * LiveFeed - Display live incident feed with auto-refresh
 */
export default function LiveFeed({ incidents = [], refreshInterval = 10000 }) {
  const [displayIncidents, setDisplayIncidents] = useState(incidents);

  useEffect(() => {
    setDisplayIncidents(incidents);
  }, [incidents]);

  const timeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">Live Incident Feed</h3>
        <p className="mt-1 text-sm text-slate-400">Real-time reports from the field</p>
      </div>

      {displayIncidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm text-slate-400">No incidents to display</p>
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto space-y-3 pr-3">
          {displayIncidents.map((incident, idx) => {
            const config = SEVERITY_CONFIG[normalizeSeverityKey(incident?.severity)] || SEVERITY_CONFIG.UNKNOWN;

            return (
              <div
                key={incident.id || idx}
                className="animate-in slide-in-from-top-2 fade-in rounded-2xl border border-white/10 bg-slate-900/50 p-3 hover:border-white/20 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">{incident.incident_type}</p>
                      <div className={`rounded-full px-2 py-0.5 text-xs font-bold ${config.bg} ${config.color}`}>
                        {config.badge}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{incident.area_name}</p>
                    {incident.description && (
                      <p className="mt-1 text-xs text-slate-300 line-clamp-1">{incident.description}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">{timeAgo(incident.created_at)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-white/10">
        <p className="text-xs text-slate-500">Auto-refreshes every {refreshInterval / 1000}s</p>
      </div>
    </div>
  );
}
