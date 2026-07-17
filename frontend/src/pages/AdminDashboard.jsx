import { useState, useEffect } from 'react';
import MetricCard from '../components/MetricCard';
import { BarChartComponent, PieChartComponent } from '../components/IncidentChart';
import LiveFeed from '../components/LiveFeed';
import InsightCard from '../components/InsightCard';
import api from '../api/client';

export default function AdminDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [activeSosAlerts, setActiveSosAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const resolveSosAlert = async (alertId) => {
    try {
      await api.patch(`/sos/${alertId}/resolve`);
      setActiveSosAlerts((current) => current.filter((alert) => alert.id !== alertId));
    } catch (err) {
      console.error('Failed to resolve SOS alert:', err);
    }
  };

  // Fetch all dashboard data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const [dashRes, heatmapRes, incidentsRes, sosRes] = await Promise.all([
          api.get('/admin/dashboard'),
          api.get('/admin/heatmap'),
          api.get('/incidents/recent?limit=50'),
          api.get('/sos/active'),
        ]);

        setDashboard(dashRes.data);
        setHeatmap(heatmapRes.data);
        setIncidents(incidentsRes.data?.incidents || []);
        setActiveSosAlerts(sosRes.data?.alerts || []);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Refresh every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin">
          <div className="h-12 w-12 rounded-full border-4 border-slate-600 border-t-cyan-400" />
        </div>
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-6 text-center text-red-300">
        {error}
      </div>
    );
  }

  // Transform data for charts
  const incidentsByType = dashboard?.incidents_by_type?.map((item) => ({
    name: item.type,
    value: item.count,
  })) || [];

  const incidentsBySeverity = dashboard?.incidents_by_severity?.map((item) => ({
    name: item.severity?.toUpperCase(),
    count: item.count,
  })) || [];

  const incidentsByArea = dashboard?.incidents_by_area || [];

  return (
    <div className="min-h-screen bg-slate-950 pb-12">
      {/* Header */}
      <div className="border-b border-white/10 bg-gradient-to-b from-slate-950 to-slate-950/50 px-6 py-8 backdrop-blur-lg">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white">Admin Dashboard</h1>
              <p className="mt-2 text-slate-400">Real-time safety analytics for Indore</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-300">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Metric Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8">
          <MetricCard
            icon="🚨"
            label="Total Incidents"
            value={dashboard?.total_incidents || 0}
            change={12}
            color="red"
          />
          <MetricCard
            icon="⚠️"
            label="High Risk Areas"
            value={dashboard?.high_severity_incidents || 0}
            change={-8}
            color="amber"
          />
          <MetricCard
            icon="📍"
            label="Unsafe Zones"
            value={dashboard?.active_unsafe_zones || 0}
            change={0}
            color="red"
          />
          <MetricCard
            icon="🤖"
            label="AI Predictions"
            value={dashboard?.ai_predictions_generated || 0}
            change={24}
            color="cyan"
          />
          <MetricCard
            icon="🛡️"
            label="Avg Safety Score"
            value={`${dashboard?.average_safety_score || 0}%`}
            change={5}
            color="emerald"
          />
        </div>

        {/* Charts Grid */}
        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          {/* Incidents by Type */}
          {incidentsByType.length > 0 && (
            <PieChartComponent
              data={incidentsByType}
              title="Incidents by Type"
            />
          )}

          {/* Incidents by Severity */}
          {incidentsBySeverity.length > 0 && (
            <BarChartComponent
              data={incidentsBySeverity}
              title="Incidents by Severity"
              dataKey="count"
            />
          )}
        </div>

        {/* Heatmap Summary */}
        <div className="grid gap-6 lg:grid-cols-4 mb-8">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
            <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Most Unsafe Area</p>
            <p className="mt-3 text-2xl font-bold text-red-400">{heatmap?.most_unsafe_area?.name}</p>
            <p className="mt-2 text-xs text-slate-500">{heatmap?.most_unsafe_area?.incidents} incidents</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
            <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Safest Area</p>
            <p className="mt-3 text-2xl font-bold text-emerald-400">{heatmap?.safest_area?.name}</p>
            <p className="mt-2 text-xs text-slate-500">{heatmap?.safest_area?.incidents} incidents</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
            <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Most Reported Type</p>
            <p className="mt-3 text-2xl font-bold text-cyan-400">{heatmap?.most_reported_type?.type}</p>
            <p className="mt-2 text-xs text-slate-500">{heatmap?.most_reported_type?.count} reports</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
            <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Night Safety Score</p>
            <p className="mt-3 text-2xl font-bold text-amber-400">{heatmap?.average_night_safety}%</p>
            <p className="mt-2 text-xs text-slate-500">Critical threshold</p>
          </div>
        </div>

        {/* Active SOS Alerts */}
        <div className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Active SOS Alerts</h2>
              <p className="text-sm text-slate-400">Review live emergency alerts and take action.</p>
            </div>
          </div>
          {activeSosAlerts.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-slate-700 bg-slate-950/70 p-6 text-sm text-slate-400">
              No active SOS alerts at this time.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {activeSosAlerts.map((alert) => (
                <div key={alert.id} className="rounded-3xl border border-white/10 bg-slate-950/80 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Alert ID #{alert.id}</p>
                      <p className="mt-1 text-base font-semibold text-white">{alert.message || 'SOS alert received'}</p>
                    </div>
                    <div className="rounded-full bg-amber-500/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-amber-200">
                      {alert.status}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm text-slate-300">
                    <div>
                      <div className="text-slate-400">Location</div>
                      <div className="font-medium text-white">{alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Source</div>
                      <div className="font-medium text-white">{alert.source}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Triggered</div>
                      <div className="font-medium text-white">{new Date(alert.triggered_at).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => resolveSosAlert(alert.id)}
                      className="rounded-full border border-emerald-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200 transition hover:bg-emerald-400/10"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Areas */}
        {incidentsByArea.length > 0 && (
          <div className="mb-8">
            <BarChartComponent
              data={incidentsByArea}
              title="Top Areas by Incident Count"
              dataKey="count"
            />
          </div>
        )}

        {/* Live Feed and Insights */}
        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          {/* Live Feed */}
          <div>
            <LiveFeed incidents={incidents} refreshInterval={10000} />
          </div>

          {/* AI Insights */}
          <div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
              <h3 className="text-lg font-semibold text-white mb-4">AI Safety Insights</h3>
              <div className="space-y-4">
                <InsightCard
                  icon="📈"
                  title="Rajwada Trend"
                  description="Incidents in Rajwada increased by 24% this week, primarily due to poor lighting conditions and high foot traffic during evening hours."
                  trend="up"
                  trendValue={24}
                />
                <InsightCard
                  icon="🌙"
                  title="Night Safety Alert"
                  description="Night safety in Loha Mandi dropped to critically low levels. Average safety score: 28%. Recommend increased police presence."
                  trend="up"
                  trendValue={35}
                />
                <InsightCard
                  icon="💡"
                  title="Lighting Impact"
                  description="Poor lighting is highly correlated with unsafe routes. Installing smart streetlights could improve safety score by 18-22%."
                  trend="down"
                  trendValue={20}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Stats */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Total Areas Monitored</p>
              <p className="mt-2 text-2xl font-bold text-cyan-400">12</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Critical Areas</p>
              <p className="mt-2 text-2xl font-bold text-red-400">{heatmap?.critical_areas_count || 0}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Last Updated</p>
              <p className="mt-2 text-xl font-bold text-slate-300">
                {new Date().toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
