/**
 * Presentation-layer translation for incident copy and location display.
 *
 * The photo-analysis (CNN) endpoint writes technical, model-facing text
 * into incident_type/description ("Area Analysis - UNSAFE", "CNN image
 * analysis: UNSAFE area") and defaults lat/lng to 0,0 since it doesn't
 * capture the user's real location. Real users should never see model
 * names or raw 0,0 coordinates. These helpers translate that at render
 * time without touching the backend or the stored data.
 */

export function getFriendlyIncidentType(incidentType) {
  if (!incidentType) return 'Incident';
  const match = /^Area Analysis - (\w+)$/i.exec(incidentType.trim());
  if (match) {
    const label = match[1].toLowerCase();
    if (label === 'unsafe') return 'Unsafe area (from photo)';
    if (label === 'safe') return 'Safe area (from photo)';
    return 'Area flagged (from photo)';
  }
  return incidentType;
}

export function getFriendlyDescription(description) {
  const text = (description || '').trim();
  const match = /^CNN image analysis:\s*(\w+)\s*area$/i.exec(text);
  if (match) {
    const label = match[1].toLowerCase();
    if (label === 'unsafe') return 'Area flagged unsafe from photo analysis.';
    if (label === 'safe') return 'Area flagged safe from photo analysis.';
    return 'Area condition flagged from photo analysis.';
  }
  return description;
}

// Photo-analysis incidents default to lat=0, lng=0 (not a real Indore
// location), so treat exact 0,0 the same as missing coordinates.
export function hasValidLocation(incident) {
  const lat = Number(incident?.lat);
  const lng = Number(incident?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export function getLocationLabel(incident) {
  if (hasValidLocation(incident)) {
    return `${Number(incident.lat).toFixed(3)}, ${Number(incident.lng).toFixed(3)}`;
  }
  return incident?.area_name || 'Location unavailable';
}
