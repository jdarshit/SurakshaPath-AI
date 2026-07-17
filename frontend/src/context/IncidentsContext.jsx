import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';

const IncidentsContext = createContext(null);

// Incidents are needed on both Home (map markers, quick stats) and the
// Alerts page (feed list) - fetching/polling once here instead of in each
// page avoids duplicate /incidents/recent calls and duplicate poll timers.
export function IncidentsProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);

  useEffect(() => {
    // No point polling incidents on the public /auth page.
    if (!isAuthenticated) return undefined;

    let mounted = true;

    const fetchIncidents = async () => {
      setIncidentsLoading(true);
      try {
        const response = await api.get('/incidents/recent?skip=0&limit=50');
        if (mounted) {
          setIncidents(response.data?.incidents || []);
        }
      } catch (err) {
        console.error('Failed to fetch incidents:', err);
      } finally {
        if (mounted) setIncidentsLoading(false);
      }
    };

    fetchIncidents();
    const interval = setInterval(fetchIncidents, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  const addIncident = (incident) => {
    if (!incident) return;
    setIncidents((prev) => [incident, ...prev]);
  };

  return (
    <IncidentsContext.Provider value={{ incidents, incidentsLoading, addIncident }}>
      {children}
    </IncidentsContext.Provider>
  );
}

export function useIncidents() {
  const context = useContext(IncidentsContext);
  if (!context) {
    throw new Error('useIncidents must be used within IncidentsProvider');
  }
  return context;
}
