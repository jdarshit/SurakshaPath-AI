import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { normalizeSeverityKey } from '../utils/severity';
import { getFriendlyIncidentType, getFriendlyDescription, getLocationLabel } from '../utils/incidentDisplay';

// Popup content is built as a raw HTML string (Leaflet bindPopup), so any
// user-submitted text (description, area_name) must be escaped - otherwise
// a report description like `<img src=x onerror=...>` would execute for
// anyone whose map renders that marker's popup.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

const SEVERITY_COLORS = {
  HIGH: '#ef4444', // red
  MEDIUM: '#f97316', // orange
  LOW: '#eab308', // yellow
  UNKNOWN: '#94a3b8', // neutral gray
};

const SEVERITY_ICONS = {
  HIGH: '🔴',
  MEDIUM: '🟠',
  LOW: '🟡',
  UNKNOWN: '⚪',
};

/**
 * IncidentLayer - Renders incident markers on the map
 * Each incident is displayed as a circle marker with color based on severity
 */
export default function IncidentLayer({ incidents = [], visible = true }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !visible) return;

    const layers = [];

    // Create marker for each incident
    incidents.forEach((incident) => {
      if (!Number.isFinite(Number(incident?.lat)) || !Number.isFinite(Number(incident?.lng))) return;
      const severityKey = normalizeSeverityKey(incident?.severity);
      const color = SEVERITY_COLORS[severityKey] || SEVERITY_COLORS.UNKNOWN;

      // Create circle marker
      const marker = L.circleMarker([incident.lat, incident.lng], {
        radius: 8,
        fillColor: color,
        color: color,
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.8,
      });

      // Create popup content
      const popupContent = `
        <div style="padding: 8px; font-size: 12px;">
          <div style="font-weight: 600; color: #1e293b; margin-bottom: 4px;">
            ${SEVERITY_ICONS[severityKey]} ${escapeHtml(getFriendlyIncidentType(incident.incident_type))}
          </div>
          <div style="color: #475569; margin-bottom: 4px;">
            <strong>Area:</strong> ${escapeHtml(incident.area_name || 'Unknown area')}
          </div>
          <div style="color: #475569; margin-bottom: 4px;">
            <strong>Severity:</strong> <span style="color: ${color}; font-weight: 600;">${severityKey}</span>
          </div>
          <div style="color: #475569; margin-bottom: 4px;">
            <strong>Description:</strong> ${escapeHtml(getFriendlyDescription(incident.description))}
          </div>
          <div style="color: #475569; margin-bottom: 4px;">
            <strong>Location:</strong> ${escapeHtml(getLocationLabel(incident))}
          </div>
          <div style="color: #64748b; font-size: 11px; margin-top: 4px;">
            ${escapeHtml(new Date(incident.created_at).toLocaleString())}
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        maxWidth: 250,
        className: 'incident-popup',
      });

      marker.addTo(map);
      layers.push(marker);
    });

    // Cleanup: remove markers when component unmounts or visibility changes
    return () => {
      layers.forEach((layer) => map.removeLayer(layer));
    };
  }, [map, incidents, visible]);

  return null; // This component only manages map layers
}
