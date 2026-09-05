import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { INDORE_SAFETY_ZONES, getSafetyCategory, SAFETY_COLORS, SAFETY_LABELS } from '../data/safetyZones';

/**
 * SafetyZoneLayer - Renders colored safety zones on the Leaflet map
 * Each zone is a circle with opacity and color based on safety score
 * Uses react-leaflet's useMap hook to get the map instance
 */
export default function SafetyZoneLayer({ visible = true }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !visible) return;

    const layers = [];

    // Create circle for each safety zone
    INDORE_SAFETY_ZONES.forEach((zone) => {
      const category = getSafetyCategory(zone.safety_score);
      const color = SAFETY_COLORS[category];
      const label = SAFETY_LABELS[category];

      // Calculate opacity based on danger level (inverted: unsafe = high opacity)
      const opacity = 0.4 + (1 - zone.safety_score / 100) * 0.4; // 0.4-0.8

      const circle = L.circle([zone.lat, zone.lng], {
        radius: zone.radius,
        color: color,
        weight: 2,
        opacity: opacity,
        fillColor: color,
        fillOpacity: opacity * 0.6, // Slightly lower fill opacity
        className: category === 'unsafe' ? 'safety-zone-pulse' : '',
      });

      // Create popup content
      const popupContent = `
        <div class="safety-zone-popup">
          <div class="font-semibold text-sm text-slate-900">📍 ${zone.area_name}</div>
          <div class="text-xs text-slate-600 mt-1">
            <span class="inline-block px-2 py-1 rounded-full ${
              category === 'safe'
                ? 'bg-emerald-100 text-emerald-700'
                : category === 'medium'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700'
            }">
              ${label}
            </span>
          </div>
          <div class="text-xs text-slate-700 mt-2">
            Safety Score: <strong>${zone.safety_score}/100</strong>
          </div>
        </div>
      `;

      circle.bindPopup(popupContent, {
        maxWidth: 220,
        className: 'safety-zone-popup-container',
      });

      circle.addTo(map);
      layers.push(circle);
    });

    // Cleanup: remove circles when component unmounts or visibility changes
    return () => {
      layers.forEach((layer) => map.removeLayer(layer));
    };
  }, [map, visible]);

  return null; // This component only manages the map layers
}
