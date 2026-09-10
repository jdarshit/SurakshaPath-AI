import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap, useMapEvent } from 'react-leaflet';
import L from 'leaflet';
import { Eye, MapPinned, Route } from 'lucide-react';
import SafetyZoneLayer from './SafetyZoneLayer';
import IncidentLayer from './IncidentLayer';
import { calculateHeading } from '../services/navigation';

const indore = [22.7196, 75.8577];
// Stable references for default props - a `[]`/`() => {}` written directly
// as a default parameter value is a NEW object every time the default
// engages, which would defeat React.memo below.
const EMPTY_ARRAY = [];
const NOOP = () => {};

const colorMap = {
  safe: '#22c55e',
  caution: '#f59e0b',
  danger: '#ef4444',
};

function toLatLng(value) {
  if (Array.isArray(value) && value.length >= 2) {
    const lat = Number(value[0]);
    const lng = Number(value[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }

  if (value && typeof value === 'object') {
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }

  return null;
}

function normalizeCoordinates(coordinates = []) {
  return coordinates.map(toLatLng).filter(Boolean);
}

function formatSafeDisplay(value, fallback = '--') {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  if (typeof value === 'number') return value.toFixed(2);
  return String(value);
}

const safeIcon = L.divIcon({
  className: 'safe-location-icon',
  html: '<span aria-hidden="true"></span>',
  iconSize: [30, 38],
  iconAnchor: [15, 38],
  popupAnchor: [0, -34],
});

function createNavigationIcon(heading = 0) {
  return L.divIcon({
    className: 'navigation-marker-icon',
    html: `
      <div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:0;border-radius:9999px;background:rgba(56,189,248,0.18);box-shadow:0 0 0 8px rgba(56,189,248,0.06);" class="navigation-pulse"></div>
        <div style="position:absolute;inset:5px;border-radius:9999px;background:linear-gradient(135deg, rgba(34,211,238,0.98), rgba(59,130,246,0.95));border:2px solid rgba(255,255,255,0.88);box-shadow:0 0 18px rgba(56,189,248,0.85);transform:rotate(${heading}deg);display:flex;align-items:center;justify-content:center;color:white;font-size:14px;font-weight:800;">
          ▲
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

/**
 * MapControlsOverlay - Render controls as a component inside MapContainer
 */
function MapControlsOverlay({ showRoutes, showSafetyZones, onToggleRoutes, onToggleSafetyZones, onToggleBoth }) {
  useMapEvent('load', (e) => {
    // Controls are rendered via this component
  });

  return (
    <div className="leaflet-top leaflet-right">
      <div className="leaflet-control leaflet-bar" style={{ backgroundColor: 'rgba(2, 8, 23, 0.85)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}>
        <button
          onClick={onToggleRoutes}
          title="Toggle route display"
          style={{
            background: showRoutes ? 'rgba(6, 182, 212, 0.3)' : 'rgba(255, 255, 255, 0.05)',
            color: showRoutes ? 'rgb(165, 243, 252)' : 'rgb(148, 163, 184)',
            border: showRoutes ? '1px solid rgba(6, 182, 212, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '4px',
            display: 'block',
            width: '100%',
          }}
        >
          <Route aria-hidden="true" className="mr-1 inline-block h-3.5 w-3.5 align-text-bottom" />
          Routes
        </button>

        <button
          onClick={onToggleSafetyZones}
          title="Toggle safety zones display"
          style={{
            background: showSafetyZones ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.05)',
            color: showSafetyZones ? 'rgb(167, 243, 208)' : 'rgb(148, 163, 184)',
            border: showSafetyZones ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '4px',
            display: 'block',
            width: '100%',
          }}
        >
          <MapPinned aria-hidden="true" className="mr-1 inline-block h-3.5 w-3.5 align-text-bottom" />
          Zones
        </button>

        <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', margin: '4px 0' }} />

        <button
          onClick={onToggleBoth}
          title="Show both routes and safety zones"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            color: 'rgb(226, 232, 240)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'block',
            width: '100%',
            transition: 'all 200ms',
          }}
        >
          <Eye aria-hidden="true" className="mr-1 inline-block h-3.5 w-3.5 align-text-bottom" />
          Show Both
        </button>
      </div>
    </div>
  );
}

/**
 * MapClickHandler - Handle map clicks to set source/destination
 */
function MapClickHandler({ onMapClick }) {
  useMapEvent('click', (e) => {
    if (e.originalEvent?.target?.closest('.leaflet-popup')) return; // Ignore popup clicks
    const { lat, lng } = e.latlng;
    onMapClick?.({ lat, lng });
  });
  return null;
}

/**
 * MapContextMenu - Right-click context menu handler
 */
function MapContextMenu({ onContextMenu }) {
  useMapEvent('contextmenu', (e) => {
    e.originalEvent.preventDefault();
    onContextMenu({
      lat: e.latlng.lat,
      lng: e.latlng.lng,
    });
  });

  return null;
}

function MapNavigationController({ position }) {
  const map = useMap();

  useEffect(() => {
    const safePosition = toLatLng(position);
    if (safePosition) {
      map.setView(safePosition, Math.max(map.getZoom(), 16), { animate: true });
    }
  }, [map, position]);

  return null;
}

function MapLocationController({ currentLocation }) {
  const map = useMap();

  useEffect(() => {
    const safeLocation = toLatLng(currentLocation);
    if (safeLocation) {
      map.flyTo(safeLocation, 16, { animate: true, duration: 1.2 });
    }
  }, [map, currentLocation]);

  return null;
}

// Auto-fits the map to the active route the moment navigation starts, so
// the user always sees the route they're on instead of whatever the map
// happened to be centered on. Fits once per navigation session (not on
// every position tick) by tracking the transition into 'running'.
function MapNavigationFitController({ status, routeCoordinates }) {
  const map = useMap();
  const hasFitRef = useRef(false);

  useEffect(() => {
    if (status === 'running' && !hasFitRef.current && routeCoordinates.length > 1) {
      const bounds = L.latLngBounds(routeCoordinates);
      map.fitBounds(bounds, { padding: [56, 56] });
      hasFitRef.current = true;
    }

    if (status === 'idle' || status === 'stopped') {
      hasFitRef.current = false;
    }
  }, [map, status, routeCoordinates]);

  return null;
}

const currentLocationIcon = new L.divIcon({
  className: 'current-location-marker',
  html: `
    <div class="current-location-marker-wrap">
      <div class="current-location-pulse"></div>
      <div class="current-location-core"></div>
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function MapView({
  source,
  destination,
  currentLocation = null,
  routes = EMPTY_ARRAY,
  activeRouteId = null,
  incidents = EMPTY_ARRAY,
  onContextMenu,
  navigation = null,
  onMapClick = NOOP,
  selectedSourceMarker = null,
  selectedDestinationMarker = null,
}) {
  const [showRoutes, setShowRoutes] = useState(true);
  const [showSafetyZones, setShowSafetyZones] = useState(true);

  const currentLocationLatLng = toLatLng(currentLocation);
  const sourceLatLng = toLatLng(source);
  const destinationLatLng = toLatLng(destination);
  // selectedSourceMarker/selectedDestinationMarker come straight from the
  // text inputs in Home.jsx: while the user is typing (e.g. mid-backspace)
  // they are `{ name: '...' }` with no lat/lng at all. Passing that
  // directly into <Marker position={[undefined, undefined]}> makes Leaflet
  // throw synchronously during render ("Invalid LatLng object"), which
  // crashes the whole app. Always resolve through toLatLng() first so an
  // in-progress/invalid edit just renders no marker instead of crashing.
  const selectedSourceMarkerLatLng = toLatLng(selectedSourceMarker);
  const selectedDestinationMarkerLatLng = toLatLng(selectedDestinationMarker);
  const center = currentLocationLatLng || sourceLatLng || indore;
  const activeRoute = useMemo(() => routes.find((route) => route.id === activeRouteId) || routes[0], [routes, activeRouteId]);
  const navigationRoute = useMemo(
    () => routes.find((route) => route.id === navigation?.routeId) || activeRoute,
    [routes, navigation?.routeId, activeRoute]
  );
  const routeCoordinates = useMemo(() => normalizeCoordinates(navigationRoute?.coordinates || []), [navigationRoute?.coordinates]);
  const splitRoute = useMemo(() => {
    const completedCoordinates = normalizeCoordinates(navigation?.completedCoordinates || []);
    const remainingCoordinates = normalizeCoordinates(navigation?.remainingCoordinates || []);
    const navigationPosition = toLatLng(navigation?.position);

    if (completedCoordinates.length || remainingCoordinates.length) {
      return {
        completed: completedCoordinates,
        remaining: remainingCoordinates,
        currentPosition: navigationPosition,
        progressPercent: navigation.progress || 0,
      };
    }

    if (!routeCoordinates.length) {
      return { completed: routeCoordinates, remaining: [], currentPosition: navigationPosition, progressPercent: navigation?.progress || 0 };
    }

    return { completed: [], remaining: routeCoordinates, currentPosition: navigationPosition, progressPercent: navigation?.progress || 0 };
  }, [navigation?.completedCoordinates, navigation?.remainingCoordinates, navigation?.position, navigation?.progress, routeCoordinates]);
  const navigationHeading = useMemo(() => {
    if (Number.isFinite(navigation?.heading)) return navigation.heading;
    if (!routeCoordinates.length) return 0;
    const index = Math.max(0, Math.min(navigation?.currentIndex || 0, Math.max(routeCoordinates.length - 2, 0)));
    return calculateHeading(routeCoordinates[index], routeCoordinates[index + 1] || routeCoordinates[index]);
  }, [navigation?.heading, navigation?.currentIndex, routeCoordinates]);

  const handleToggleRoutes = () => setShowRoutes(!showRoutes);
  const handleToggleSafetyZones = () => setShowSafetyZones(!showSafetyZones);
  const handleToggleBoth = () => {
    setShowRoutes(true);
    setShowSafetyZones(true);
  };

  const handleMapContextMenu = (location) => {
    if (onContextMenu) {
      onContextMenu(location);
    }
  };

  return (
    <div className="h-[45vh] min-h-[360px] max-h-[520px] overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-3 shadow-glow lg:h-[calc(100vh-12rem)] lg:max-h-none">
      <MapContainer center={center} zoom={12} scrollWheelZoom zoomControl className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Safety Zones Layer */}
        {showSafetyZones && <SafetyZoneLayer visible={true} />}

        {/* Incident Layer */}
        <IncidentLayer incidents={incidents} visible={true} />

        {/* Click Handler */}
        <MapClickHandler onMapClick={onMapClick} />

        {/* Context Menu Handler */}
        <MapContextMenu onContextMenu={handleMapContextMenu} />

        {/* Map Controls */}
        <MapControlsOverlay
          showRoutes={showRoutes}
          showSafetyZones={showSafetyZones}
          onToggleRoutes={handleToggleRoutes}
          onToggleSafetyZones={handleToggleSafetyZones}
          onToggleBoth={handleToggleBoth}
        />

        {navigation?.status !== 'running' && currentLocationLatLng && (
          <MapLocationController currentLocation={currentLocation} />
        )}

        <MapNavigationFitController status={navigation?.status} routeCoordinates={routeCoordinates} />



        {/* Route Markers and Polylines */}
        {showRoutes && (
          <>
            {currentLocationLatLng && (
              <Marker position={currentLocationLatLng} icon={currentLocationIcon}>
                <Popup>
                  <div>
                    <p className="font-semibold">Current position</p>
                    <p className="text-xs text-slate-600">GPS detected location</p>
                  </div>
                </Popup>
              </Marker>
            )}
            {/* Selected Source Marker */}
            {selectedSourceMarkerLatLng && (
              <Marker position={selectedSourceMarkerLatLng} icon={createNavigationIcon(0)}>
                <Popup>
                  <div className="text-xs font-semibold text-blue-600">📍 Source: {selectedSourceMarker?.name || 'Starting Point'}</div>
                </Popup>
              </Marker>
            )}
            {/* Selected Destination Marker */}
            {selectedDestinationMarkerLatLng && (
              <Marker position={selectedDestinationMarkerLatLng} icon={safeIcon}>
                <Popup>
                  <div className="text-xs font-semibold text-red-600">🎯 Destination: {selectedDestinationMarker?.name || 'End Point'}</div>
                </Popup>
              </Marker>
            )}
            {sourceLatLng && !selectedSourceMarkerLatLng && (
              <Marker position={sourceLatLng} icon={safeIcon}>
                <Popup>📍 Source</Popup>
              </Marker>
            )}
            {destinationLatLng && !selectedDestinationMarkerLatLng && (
              <Marker position={destinationLatLng} icon={safeIcon}>
                <Popup>🎯 Destination</Popup>
              </Marker>
            )}
            {/* Display all routes */}
            {routes.map((route) => {
              const safeRouteCoordinates = normalizeCoordinates(route.coordinates || []);
              if (safeRouteCoordinates.length < 2) return null;

              const isActive = activeRouteId === route.id;
              const weight = isActive ? 6 : 3;
              const opacity = isActive ? 0.95 : 0.6;
              const color = colorMap[route.color] || '#999';

              const isNavigationRoute = ['running', 'paused', 'stopped'].includes(navigation?.status) && route.id === navigation.routeId;

              if (isNavigationRoute) {
                return (
                  <>
                    {splitRoute?.completed?.length > 1 && (
                      <Polyline
                        key={`${route.id}-completed`}
                        positions={splitRoute.completed}
                        pathOptions={{ color: '#22c55e', weight: 7, opacity: 0.95 }}
                      />
                    )}
                    <Polyline
                      key={`${route.id}-remaining`}
                      positions={splitRoute.remaining.length > 1 ? splitRoute.remaining : safeRouteCoordinates}
                      pathOptions={{ color, weight, opacity, dashArray: '8, 8' }}
                    />
                    {splitRoute.currentPosition && (
                      <Marker position={splitRoute.currentPosition} icon={createNavigationIcon(navigationHeading)}>
                        <Popup>
                          <div>
                            <p className="font-semibold">Navigation in progress</p>
                            <p className="text-xs text-slate-600">{navigation.currentSafetyStatus || 'Monitoring route safety'}</p>
                          </div>
                        </Popup>
                      </Marker>
                    )}
                    {safeRouteCoordinates.length > 0 && <MapNavigationController position={splitRoute.currentPosition} />}
                  </>
                );
              }

              return (
                <Polyline
                  key={route.id}
                  positions={safeRouteCoordinates}
                  pathOptions={{
                    color,
                    weight,
                    opacity,
                    dashArray: isActive ? null : '5, 5',
                  }}
                />
              );
            })}
          </>
        )}
      </MapContainer>
    </div>
  );
}

// The map (Leaflet + all its layers/markers/polylines) is the most
// expensive thing on Home, and Home re-renders often (GPS updates, toasts,
// live navigation ticks). Memoizing keeps MapView from re-rendering unless
// one of its own props actually changed.
export default memo(MapView);
