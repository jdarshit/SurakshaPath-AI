import { useMemo } from 'react';
import IncidentPanel from '../components/IncidentPanel';
import { useIncidents } from '../context/IncidentsContext';

export default function Alerts() {
  const { incidents, incidentsLoading } = useIncidents();

  const areasCoveredCount = useMemo(
    () => new Set(incidents.map((incident) => incident?.area_name).filter(Boolean)).size,
    [incidents]
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Alerts & Reports</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Recent incidents reported by the community near you.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card !p-4">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Incidents Reported Nearby</p>
          <p className="mt-1 quick-stats-value font-bold text-white">{incidents.length}</p>
        </div>
        <div className="glass-card !p-4">
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Areas Covered</p>
          <p className="mt-1 quick-stats-value font-bold text-[var(--safe-green)]">{areasCoveredCount}</p>
        </div>
      </div>

      <IncidentPanel incidents={incidents} isLoading={incidentsLoading} />
    </div>
  );
}
