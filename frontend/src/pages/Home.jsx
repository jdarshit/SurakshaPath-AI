import { useMemo, useState, useEffect, useRef } from 'react';
import MapView from '../components/MapView';
import LocationAutocomplete from '../components/LocationAutocomplete';
import RouteCard from '../components/RouteCard';
import RouteComparisonPanel from '../components/RouteComparisonPanel';
import LiveNavigationPanel from '../components/LiveNavigationPanel';
import SmartAlertToast from '../components/SmartAlertToast';
import IncidentReportModal from '../components/IncidentReportModal';
import { useSafeRoute } from '../hooks/useSafeRoute';
import { useToast, ToastContainer } from '../hooks/useToast.jsx';
import { useIncidents } from '../context/IncidentsContext';
import { useNavigationSettings } from '../context/NavigationSettingsContext';
import {
  buildTripSummary,
  calculateHeading,
  deriveNavigationAlert,
} from '../services/navigation';
import { reverseGeocodeCoordinates } from '../services/routing';
import { reverseGeocodeWithCache } from '../services/locationSearch';
import {
  getGPSService,
  startGPS,
  stopGPS,
  getCurrentLocation,
  getRoutingLocation,
  forceRefreshGPS,
  subscribeToLocationUpdates,
} from '../services/gpsService';
import GPSDebugPanel from '../components/GPSDebugPanel';

const ALERT_COOLDOWN = 60000;
const ALERT_AUTO_DISMISS_MS = 5000;
const MAX_VISIBLE_ALERTS = 3;
const GPS_MIN_MOVEMENT_KM = 0.01;
const GEOLOCATION_UNSUPPORTED_MESSAGE = 'Geolocation not supported in this browser.';

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function haversineDistanceKm(start, end) {
  if (!start || !end) return 0;

  const toRadians = (value) => (Number(value) * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const lat1 = toRadians(start[0]);
  const lat2 = toRadians(end[0]);
  const deltaLat = toRadians(end[0] - start[0]);
  const deltaLng = toRadians(end[1] - start[1]);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lerpGpsCoordinate(start, end, progress) {
  const t = clamp(progress);
  return [
    start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t,
  ];
}

function calculateRouteDistanceKm(coordinates = []) {
  return coordinates.reduce((total, point, index) => {
    if (index === 0) return total;
    return total + haversineDistanceKm(coordinates[index - 1], point);
  }, 0);
}

function projectPointToSegment(point, segmentStart, segmentEnd) {
  const latScaleKm = 111.32;
  const lngScaleKm = 111.32 * Math.cos(((segmentStart[0] + segmentEnd[0]) / 2) * (Math.PI / 180));

  const pointX = (point[1] - segmentStart[1]) * lngScaleKm;
  const pointY = (point[0] - segmentStart[0]) * latScaleKm;
  const segmentX = (segmentEnd[1] - segmentStart[1]) * lngScaleKm;
  const segmentY = (segmentEnd[0] - segmentStart[0]) * latScaleKm;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const progress = segmentLengthSquared === 0 ? 0 : clamp((pointX * segmentX + pointY * segmentY) / segmentLengthSquared);

  return {
    progress,
    coordinate: lerpGpsCoordinate(segmentStart, segmentEnd, progress),
  };
}

function findNearestRouteProgress(position, coordinates = []) {
  if (!position || !coordinates.length) {
    return {
      nearestCoordinate: null,
      currentIndex: 0,
      segmentProgress: 0,
      distanceCoveredKm: 0,
      distanceRemainingKm: 0,
      totalDistanceKm: 0,
      progressPercent: 0,
      completedCoordinates: [],
      remainingCoordinates: coordinates,
    };
  }

  if (coordinates.length === 1) {
    return {
      nearestCoordinate: coordinates[0],
      currentIndex: 0,
      segmentProgress: 1,
      distanceCoveredKm: 0,
      distanceRemainingKm: 0,
      totalDistanceKm: 0,
      progressPercent: 100,
      completedCoordinates: coordinates,
      remainingCoordinates: coordinates,
    };
  }

  const segmentDistances = [];
  let totalDistanceKm = 0;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const distance = haversineDistanceKm(coordinates[index], coordinates[index + 1]);
    segmentDistances.push(distance);
    totalDistanceKm += distance;
  }

  let best = {
    distanceToRouteKm: Number.POSITIVE_INFINITY,
    currentIndex: 0,
    segmentProgress: 0,
    nearestCoordinate: coordinates[0],
    distanceCoveredKm: 0,
  };

  let distanceBeforeSegmentKm = 0;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const projected = projectPointToSegment(position, coordinates[index], coordinates[index + 1]);
    const distanceToRouteKm = haversineDistanceKm(position, projected.coordinate);

    if (distanceToRouteKm < best.distanceToRouteKm) {
      best = {
        distanceToRouteKm,
        currentIndex: index,
        segmentProgress: projected.progress,
        nearestCoordinate: projected.coordinate,
        distanceCoveredKm: distanceBeforeSegmentKm + segmentDistances[index] * projected.progress,
      };
    }

    distanceBeforeSegmentKm += segmentDistances[index];
  }

  const progressPercent = totalDistanceKm > 0 ? (best.distanceCoveredKm / totalDistanceKm) * 100 : 100;
  const distanceRemainingKm = Math.max(0, totalDistanceKm - best.distanceCoveredKm);
  const nextIndex = Math.min(best.currentIndex + 1, coordinates.length - 1);

  return {
    ...best,
    totalDistanceKm,
    distanceRemainingKm,
    progressPercent: clamp(progressPercent, 0, 100),
    completedCoordinates: [...coordinates.slice(0, best.currentIndex + 1), best.nearestCoordinate],
    remainingCoordinates: [best.nearestCoordinate, ...coordinates.slice(nextIndex + 1)],
  };
}

export default function Home() {
  const { loading, error, data, findRoute, setData } = useSafeRoute();
  const { toasts, showToast, removeToast } = useToast();
  const { incidents, addIncident } = useIncidents();
  const { settings: navigationSettings } = useNavigationSettings();

  const [source, setSource] = useState({ name: 'Indore Railway Station', lat: 22.6307, lng: 75.8394, address: 'Indore Railway Station' });
  const [sourceText, setSourceText] = useState('Indore Railway Station');
  const [destination, setDestination] = useState({ name: 'Rajwada, Indore', lat: 22.7177, lng: 75.8545, address: 'Rajwada, Indore' });
  const [destinationText, setDestinationText] = useState('Rajwada, Indore');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [locationMessage, setLocationMessage] = useState('');
  const [locateMeLoading, setLocateMeLoading] = useState(false);
  const [showMapClickFallback, setShowMapClickFallback] = useState(false);
  const [activeRouteId, setActiveRouteId] = useState(null);
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [incidentLocation, setIncidentLocation] = useState(null);
  const [isRouteCardExpanded, setIsRouteCardExpanded] = useState(true);
  const [smartAlerts, setSmartAlerts] = useState([]);
  const [isLiveMode, setIsLiveMode] = useState(true);
  const routes = data?.routes || [];
  const activeRoute = useMemo(() => routes.find((route) => route.id === activeRouteId) || routes[0], [routes, activeRouteId]);
  const [navigation, setNavigation] = useState({
    status: 'idle',
    routeId: null,
    currentIndex: 0,
    segmentProgress: 0,
    position: null,
    heading: 0,
    progress: 0,
    distanceRemaining: 0,
    etaRemaining: null,
    currentSafetyStatus: 'Awaiting navigation start',
    currentZoneSafety: 'Unknown',
    nextWarning: 'Start navigation to receive live alerts.',
    alerts: [],
    timeline: [],
    rerouteRecommendation: '',
    summary: null,
    startedAt: null,
    totalDistanceKm: 0,
    completedCoordinates: [],
    remainingCoordinates: [],
    gpsLoading: false,
    gpsError: '',
  });

  const markerAnimationRef = useRef(null);
  const rerouteLockRef = useRef(false);
  const lastIncidentCountRef = useRef(0);
  const spokenAlertIdsRef = useRef(new Set());
  const sourceEditedRef = useRef(false);
  // Bumped whenever a "Use Current Location" request should be considered
  // stale (user typed/selected a source manually, or a new locate request
  // started). Any in-flight geolocation callback compares its own captured
  // id against the current value before touching state, so a slow second
  // attempt can never race with / overwrite manual input.
  const locateRequestIdRef = useRef(0);
  const latestGpsRef = useRef(null);
  const lastGpsPointRef = useRef(null);
  const distanceTraveledKmRef = useRef(0);
  const triggeredZones = useRef(new Set());
  const lastAlertTime = useRef({});
  const activeZoneIdRef = useRef('');
  const alertDismissTimersRef = useRef({});
  const liveModeRef = useRef(isLiveMode);
  const navigationRef = useRef(navigation);
  const routesRef = useRef(routes);
  const activeRouteRef = useRef(activeRoute);
  const gpsUnsubscribeRef = useRef(null);
  const [showGPSDebug, setShowGPSDebug] = useState(false);

  useEffect(() => {
    navigationRef.current = navigation;
  }, [navigation]);

  useEffect(() => {
    liveModeRef.current = isLiveMode;
  }, [isLiveMode]);

  useEffect(() => {
    routesRef.current = routes;
  }, [routes]);

  useEffect(() => {
    activeRouteRef.current = activeRoute;
  }, [activeRoute]);

  const clearAlertTimers = () => {
    Object.values(alertDismissTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    alertDismissTimersRef.current = {};
  };

  const removeVisibleAlert = (alertId) => {
    setSmartAlerts((prev) => prev.filter((item) => item.id !== alertId));
    setNavigation((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((item) => item.id !== alertId),
    }));

    if (alertDismissTimersRef.current[alertId]) {
      window.clearTimeout(alertDismissTimersRef.current[alertId]);
      delete alertDismissTimersRef.current[alertId];
    }
  };

  const resetNavigationTrackingRefs = () => {
    distanceTraveledKmRef.current = 0;
    lastGpsPointRef.current = null;
    activeZoneIdRef.current = '';
    triggeredZones.current.clear();
    lastAlertTime.current = {};
    spokenAlertIdsRef.current = new Set();
    clearAlertTimers();
  };

  const pushSmartAlerts = (items = []) => {
    if (!items.length) return;

    const stampedItems = items.map((item, index) => ({
      ...item,
      id: item.id || `${Date.now()}-${item.type || 'alert'}-${index}`,
      time: item.time || new Date().toISOString(),
    }));

    setSmartAlerts((prev) => {
      const withoutDuplicates = prev.filter((existing) => !stampedItems.some((item) => item.text === existing.text));
      return [...withoutDuplicates, ...stampedItems].slice(-MAX_VISIBLE_ALERTS);
    });

    setNavigation((prev) => {
      const withoutDuplicates = prev.alerts.filter((existing) => !stampedItems.some((item) => item.text === existing.text));
      const nextAlerts = [
        ...withoutDuplicates,
        ...stampedItems.map((item) => ({ id: item.id, type: item.type || 'info', text: item.text, time: item.time })),
      ].slice(-MAX_VISIBLE_ALERTS);

      return { ...prev, alerts: nextAlerts };
    });

    stampedItems.forEach((item) => {
      if (alertDismissTimersRef.current[item.id]) {
        window.clearTimeout(alertDismissTimersRef.current[item.id]);
      }

      alertDismissTimersRef.current[item.id] = window.setTimeout(() => {
        removeVisibleAlert(item.id);
      }, ALERT_AUTO_DISMISS_MS);

      if (item.speak && typeof window !== 'undefined' && window.speechSynthesis && !spokenAlertIdsRef.current.has(item.id)) {
        const utterance = new SpeechSynthesisUtterance(item.voiceText || item.text || 'Alert');
        utterance.rate = 0.95;
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
        spokenAlertIdsRef.current.add(item.id);
      }
    });
  };

  const enqueueZoneAlert = ({ alert, routeId, routeProgress, route }) => {
    if (!alert?.key || !alert?.text) return;

    const zoneId = `${routeId}:${alert.key}:${routeProgress.currentIndex}`;
    const now = Date.now();
    const lastTypeTime = lastAlertTime.current[alert.key] || 0;
    const isEnteringZone = activeZoneIdRef.current !== zoneId;

    activeZoneIdRef.current = zoneId;

    if (!isEnteringZone || triggeredZones.current.has(zoneId) || now - lastTypeTime < ALERT_COOLDOWN) {
      return;
    }

    triggeredZones.current.add(zoneId);
    lastAlertTime.current[alert.key] = now;

    const item = {
      id: `${now}-${alert.key}`,
      type: alert.type || 'info',
      title: 'AI Alert',
      text: alert.text,
      meta: alert.timeline,
      voiceText: alert.text,
      speak: Boolean(navigationSettings.voiceAlerts && alert.type !== 'info'),
      time: new Date(now).toISOString(),
    };

    pushSmartAlerts([item]);

    setNavigation((prev) => ({
      ...prev,
      nextWarning: alert.text,
      currentSafetyStatus: alert.zoneSafety,
      currentZoneSafety: alert.zoneSafety,
      rerouteRecommendation: alert.shouldReroute ? 'Safer reroute recommended based on live conditions.' : prev.rerouteRecommendation,
      timeline: [
        ...prev.timeline,
        {
          id: `${now}-${alert.key}-timeline`,
          label: alert.timeline,
          detail: alert.text,
          time: item.time,
        },
      ],
    }));

    if (alert.shouldReroute && navigationSettings.autoReroute && !rerouteLockRef.current) {
      rerouteLockRef.current = true;
      setNavigation((prev) => ({ ...prev, rerouteRecommendation: 'Searching for a safer route.' }));
      findRoute(getSourceForRouting(), getDestinationForRouting()).finally(() => {
        rerouteLockRef.current = false;
      });
    }
  };

  const updateLiveNavigationFromGps = (gpsPosition, accuracy = null) => {
    const currentNavigation = navigationRef.current;

    if (!liveModeRef.current || currentNavigation.status !== 'running') {
      return;
    }

    const route = routesRef.current.find((item) => item.id === currentNavigation.routeId) || activeRouteRef.current;
    const coordinates = route?.coordinates || [];

    if (coordinates.length < 2) {
      return;
    }

    const routeProgress = findNearestRouteProgress(gpsPosition, coordinates);
    const totalRouteDistanceKm = currentNavigation.totalDistanceKm || routeProgress.totalDistanceKm || calculateRouteDistanceKm(coordinates);
    const lastGpsPoint = lastGpsPointRef.current;
    const gpsDeltaKm = lastGpsPoint ? haversineDistanceKm(lastGpsPoint, gpsPosition) : 0;

    if (lastGpsPoint && gpsDeltaKm >= 0.002) {
      distanceTraveledKmRef.current = Math.min(totalRouteDistanceKm, distanceTraveledKmRef.current + gpsDeltaKm);
    }

    lastGpsPointRef.current = gpsPosition;

    const progressPercent = totalRouteDistanceKm > 0 ? clamp((distanceTraveledKmRef.current / totalRouteDistanceKm) * 100, 0, 100) : 0;
    const distanceRemainingKm = Math.max(0, totalRouteDistanceKm - distanceTraveledKmRef.current);
    const alert = deriveNavigationAlert({ route, progressPercent });

    enqueueZoneAlert({
      alert,
      routeId: currentNavigation.routeId,
      routeProgress,
      route,
    });

    const previousPosition = currentNavigation.position || gpsPosition;
    const targetPosition = gpsPosition;
    const startedAt = performance.now();
    const duration = 900;

    if (markerAnimationRef.current) {
      cancelAnimationFrame(markerAnimationRef.current);
      markerAnimationRef.current = null;
    }

    const updateNavigationState = (displayPosition) => {
      const remainingRatio = totalRouteDistanceKm > 0 ? distanceRemainingKm / totalRouteDistanceKm : 0;
      const eta = Math.max(0, Math.round((Number.parseInt(route?.estimatedTime, 10) || 0) * remainingRatio));
      const headingTarget = coordinates[Math.min(routeProgress.currentIndex + 1, coordinates.length - 1)] || routeProgress.nearestCoordinate;

      setNavigation((prev) => ({
        ...prev,
        currentIndex: routeProgress.currentIndex,
        segmentProgress: routeProgress.segmentProgress,
        position: displayPosition,
        heading: calculateHeading(routeProgress.nearestCoordinate, headingTarget),
        progress: Math.round(progressPercent),
        distanceRemaining: Number(distanceRemainingKm.toFixed(1)),
        etaRemaining: eta,
        currentSafetyStatus: alert.zoneSafety,
        currentZoneSafety: alert.zoneSafety,
        totalDistanceKm: Number(totalRouteDistanceKm.toFixed(2)),
        completedCoordinates: routeProgress.completedCoordinates,
        remainingCoordinates: routeProgress.remainingCoordinates,
        gpsLoading: false,
        gpsError: '',
        gpsAccuracy: accuracy,
      }));
    };

    const animateMarker = (now) => {
      const progress = clamp((now - startedAt) / duration);
      const displayPosition = lerpGpsCoordinate(previousPosition, targetPosition, progress);
      updateNavigationState(displayPosition);

      if (progress < 1) {
        markerAnimationRef.current = requestAnimationFrame(animateMarker);
      } else {
        markerAnimationRef.current = null;
      }
    };

    markerAnimationRef.current = requestAnimationFrame(animateMarker);

    if (progressPercent >= 99.5) {
      const summary = buildTripSummary(route, currentNavigation.alerts, currentNavigation.startedAt);
      const arrivalAlert = {
        id: `${Date.now()}-arrival-alert`,
        type: 'success',
        title: 'AI Alert',
        text: 'Destination reached. Trip safety summary available.',
        meta: 'Arrival detected',
        voiceText: 'Destination reached.',
        speak: Boolean(navigationSettings.voiceAlerts),
        time: new Date().toISOString(),
      };

      pushSmartAlerts([arrivalAlert]);
      setNavigation((prev) => ({
        ...prev,
        status: 'completed',
        progress: 100,
        position: gpsPosition,
        currentSafetyStatus: 'Destination reached',
        currentZoneSafety: 'Arrival zone',
        nextWarning: 'Destination reached successfully.',
        distanceRemaining: 0,
        etaRemaining: 0,
        summary,
        gpsLoading: false,
        completedCoordinates: coordinates,
        remainingCoordinates: [coordinates[coordinates.length - 1]],
        timeline: [...prev.timeline, { id: `${Date.now()}-arrival`, label: 'Destination reached', detail: 'Trip completed with live GPS monitoring.', time: new Date().toISOString() }],
      }));
      showToast('Destination reached. Trip safety summary generated.', 'success', 3500);
    }
  };

  const startWatchingLocation = async ({ forceRefresh = false } = {}) => {
    setLocationStatus('detecting');
    setLocationMessage('📍 Requesting location access...');

    if (forceRefresh) {
      await forceRefreshGPS();
    } else {
      startGPS();
    }
  };

  const stopWatchingLocation = () => {
    stopGPS();
  };

  const handleRecenterToLocation = async () => {
    await forceRefreshGPS();
  };

  // Invalidates any in-flight "Use Current Location" request. Called when
  // the user manually types a source or picks a suggestion, so a slow
  // retry landing later can never stomp on what they just typed.
  const cancelPendingLocateMe = () => {
    locateRequestIdRef.current += 1;
    if (locateMeLoading) {
      setLocateMeLoading(false);
      setLocationStatus('idle');
      setLocationMessage('');
    }
  };

  const applyLocatedPosition = async (position, requestId) => {
    if (locateRequestIdRef.current !== requestId) return; // stale/cancelled

    const lat = Number(position.coords.latitude);
    const lng = Number(position.coords.longitude);
    const accuracy = Number(position.coords.accuracy ?? 9999);
    const timestamp = Date.now();

    let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    try {
      const resolved = await reverseGeocodeCoordinates(lat, lng);
      if (resolved) address = resolved;
    } catch (geocodeError) {
      console.warn('[GPS] Reverse geocoding failed, using coordinates:', geocodeError);
    }

    if (locateRequestIdRef.current !== requestId) return; // cancelled mid-geocode

    const location = { lat, lng, accuracy, timestamp, address, name: address, source: 'manual-locate', status: 'high' };
    setCurrentLocation(location);
    setSource(location);
    setSourceText(address);
    sourceEditedRef.current = true;
    setLocationStatus('detected');
    setLocationMessage(`📍 Location found: ±${Math.round(accuracy)}m`);
    setLocateMeLoading(false);
    setShowMapClickFallback(false);
    showToast('📍 Current location set as source', 'success', 2500);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast('❌ Geolocation is not supported by this browser.', 'error', 4000);
      return;
    }

    if (locateMeLoading) return;

    const requestId = ++locateRequestIdRef.current;
    setLocateMeLoading(true);
    setShowMapClickFallback(false);
    setLocationStatus('detecting');
    setLocationMessage('📍 Requesting location access...');

    const finalizeFailure = (error) => {
      if (locateRequestIdRef.current !== requestId) return; // stale/cancelled
      setLocateMeLoading(false);

      let message;
      if (error.code === error.PERMISSION_DENIED) {
        message = 'Location permission denied. Please enable location access for this site in your browser\'s site settings, then try again.';
      } else if (error.code === error.TIMEOUT) {
        message = 'Location request timed out, even with approximate mode. You can tap the map instead to set your source.';
      } else {
        message = 'Your location is currently unavailable. You can tap the map instead to set your source.';
      }
      setLocationStatus('error');
      setLocationMessage(`❌ ${message}`);
      showToast(`❌ ${message}`, 'error', 6000);
      setShowMapClickFallback(true);
    };

    // Attempt 2: relaxed accuracy/timeout - WiFi/IP-based location is fine
    // for picking a route starting point, and this is what actually works
    // on most laptops (no GPS chip).
    const attemptApproximate = () => {
      if (locateRequestIdRef.current !== requestId) return; // stale/cancelled
      setLocationMessage('📡 Getting approximate location...');

      navigator.geolocation.getCurrentPosition(
        (position) => applyLocatedPosition(position, requestId),
        (error) => finalizeFailure(error),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    };

    // Attempt 1: high accuracy, but accept a fix up to 30s old - this alone
    // fixes most desktop/laptop timeouts, since a fresh GPS-grade fix is
    // often simply unavailable on a machine with no GPS chip.
    navigator.geolocation.getCurrentPosition(
      (position) => applyLocatedPosition(position, requestId),
      (error) => {
        if (locateRequestIdRef.current !== requestId) return; // stale/cancelled
        if (error.code === error.PERMISSION_DENIED) {
          finalizeFailure(error);
          return;
        }
        // TIMEOUT or POSITION_UNAVAILABLE -> retry with relaxed settings
        attemptApproximate();
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  };

  const getSourceForRouting = () => {
    // CRITICAL: Use direct GPS coordinates for routing, NEVER text geocoding
    
    // First priority: GPS routing coordinates (actual GPS, no re-geocoding)
    const gpsCoords = getRoutingLocation();
    if (gpsCoords && Number.isFinite(gpsCoords.lat) && Number.isFinite(gpsCoords.lng)) {
      return {
        sourceCoords: gpsCoords,
        sourceAddress: currentLocation?.address || 'Current location',
      };
    }

    // Second priority: User manually selected location
    if (source && Number.isFinite(source.lat) && Number.isFinite(source.lng)) {
      return source;
    }

    // Last resort: Text search
    return String(sourceText ?? source?.name ?? source ?? '').trim();
  };

  const getDestinationForRouting = () => {
    if (destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lng)) {
      return destination; // Pass the location object directly - has lat, lng
    }
    return String(destinationText ?? destination?.name ?? destination ?? '').trim();
  };

  const handleSourceTextChange = (nextValue) => {
    cancelPendingLocateMe();
    const safeQuery = typeof nextValue === 'string' ? nextValue : '';
    setSourceText(safeQuery);
    setSource({ name: safeQuery });
    sourceEditedRef.current = true;
  };

  const handleDestinationTextChange = (nextValue) => {
    const safeQuery = typeof nextValue === 'string' ? nextValue : '';
    setDestinationText(safeQuery);
    setDestination({ name: safeQuery });
  };

  const handleMapClick = async (coords) => {
    if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
      return;
    }

    // Reverse geocode to get location name
    const locationName = await reverseGeocodeWithCache(coords.lat, coords.lng);
    
    const newLocation = {
      lat: Number(coords.lat.toFixed(6)),
      lng: Number(coords.lng.toFixed(6)),
      name: locationName,
      address: locationName,
    };

    // If source is empty or wasn't manually set, set source; otherwise set destination
    if (!source || !hasValidCoordinates(source) || sourceEditedRef.current === false) {
      setSource(newLocation);
      setSourceText(locationName);
      sourceEditedRef.current = true;
      showToast(`📍 Source set to ${locationName}`, 'info', 2000);
    } else {
      setDestination(newLocation);
      setDestinationText(locationName);
      showToast(`🎯 Destination set to ${locationName}`, 'info', 2000);
    }
  };

  const hasValidCoordinates = (location) => (
    location
    && Number.isFinite(Number(location.lat))
    && Number.isFinite(Number(location.lng))
  );

  const hasRoutingInput = (location, text) => {
    if (hasValidCoordinates(location)) return true;
    return String(text ?? location?.name ?? '').trim().length > 0;
  };

  const navigateRoute = useMemo(() => routes.find((route) => route.id === navigation.routeId) || activeRoute, [routes, navigation.routeId, activeRoute]);

  useEffect(() => {
    startWatchingLocation();

    // Subscribe to GPS location updates
    gpsUnsubscribeRef.current = subscribeToLocationUpdates((location) => {
      if (!location) return;

      if (location.error) {
        setLocationStatus('error');
        setLocationMessage(`❌ ${location.error}`);
        setCurrentLocation(location);
        return;
      }

      const { lat, lng, accuracy, status, source, timestamp } = location;

      // Update current location state
      latestGpsRef.current = location;
      setCurrentLocation(location);

      // Update UI messages based on accuracy
      if (status === 'high') {
        setLocationStatus('detected');
        setLocationMessage(`📍 GPS locked: ±${Math.round(accuracy)}m`);
      } else if (status === 'good') {
        setLocationStatus('good');
        setLocationMessage(`📡 Good accuracy: ±${Math.round(accuracy)}m`);
      } else if (status === 'acceptable') {
        setLocationStatus('acceptable');
        setLocationMessage(`⚠️ Acceptable: ±${Math.round(accuracy)}m (Desktop WiFi location may vary)`);
      } else {
        setLocationStatus('approx');
        setLocationMessage(`⚠️ Low accuracy: ±${Math.round(accuracy)}m`);
      }

      // Update source if not manually edited and not during navigation
      if (!sourceEditedRef.current && navigationRef.current.status !== 'running') {
        // Try to get address from reverse geocoding
        reverseGeocodeCoordinates(lat, lng)
          .then((address) => {
            if (address) {
              setSourceText(address);
              setSource({ lat, lng, address, name: address, accuracy, timestamp });
            }
          })
          .catch(() => {
            // Fallback to coordinates display
            const fallbackAddr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            setSourceText(fallbackAddr);
            setSource({ lat, lng, address: fallbackAddr, name: fallbackAddr, accuracy, timestamp });
          });
      }

      // Update live navigation if active
      if (navigationRef.current.status === 'running') {
        updateLiveNavigationFromGps([lat, lng], accuracy);
      }
    });

    return () => {
      stopWatchingLocation();
      if (gpsUnsubscribeRef.current) {
        gpsUnsubscribeRef.current();
      }
      clearAlertTimers();
      if (markerAnimationRef.current) {
        cancelAnimationFrame(markerAnimationRef.current);
        markerAnimationRef.current = null;
      }
    };
  }, []);

  // GPS debug panel toggle (Ctrl+Shift+G)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        setShowGPSDebug(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const dismissSmartAlert = (alertId) => {
    removeVisibleAlert(alertId);
  };

  useEffect(() => {
    if (navigation.status !== 'running') {
      lastIncidentCountRef.current = incidents.length;
      return;
    }

    const incidentDelta = Math.max(0, incidents.length - lastIncidentCountRef.current);
    if (incidentDelta <= 0) return;

    lastIncidentCountRef.current = incidents.length;

    const currentRoute = routes.find((route) => route.id === navigation.routeId) || activeRoute;
    if (!currentRoute) return;

    const alert = deriveNavigationAlert({ route: currentRoute, progressPercent: navigation.progress, incidentsDelta });
    enqueueZoneAlert({
      alert,
      routeId: navigation.routeId,
      routeProgress: { currentIndex: navigation.currentIndex || 0 },
      route: currentRoute,
    });
  }, [incidents.length, navigation.status, navigation.routeId, navigation.progress, navigation.currentIndex, routes, activeRoute]);

  const handleSearch = async () => {
    if (!hasRoutingInput(source, sourceText) && !hasValidCoordinates(currentLocation)) {
      alert('Location or destination missing');
      console.warn('[ROUTING] Missing source location');
      return null;
    }

    if (!hasRoutingInput(destination, destinationText)) {
      alert('Location or destination missing');
      console.warn('[ROUTING] Missing destination location');
      return null;
    }

    const start = getSourceForRouting();
    const end = getDestinationForRouting();

    setData(null);
    setActiveRouteId(null);

    const result = await findRoute(start, end);
    if (result?.routes?.length) {
      setActiveRouteId(result.routes[0].id);
    }
    return result;
  };

  const startNavigation = (routeOverride = activeRoute) => {
    const selectedRoute = routeOverride || activeRoute;
    if (!selectedRoute?.coordinates?.length) {
      showToast('Find a route first to start live navigation.', 'warning', 3000);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('unsupported');
      setLocationMessage(GEOLOCATION_UNSUPPORTED_MESSAGE);
      setNavigation((prev) => ({ ...prev, gpsLoading: false, gpsError: GEOLOCATION_UNSUPPORTED_MESSAGE }));
      showToast(GEOLOCATION_UNSUPPORTED_MESSAGE, 'error', 3500);
      return;
    }

    const routeDistanceKm = calculateRouteDistanceKm(selectedRoute.coordinates) || Number.parseFloat(selectedRoute.distance) || 0;
    const initialAlert = deriveNavigationAlert({ route: selectedRoute, progressPercent: 0 });
    lastIncidentCountRef.current = incidents.length;
    const initialGpsPosition = latestGpsRef.current ? [latestGpsRef.current.lat, latestGpsRef.current.lng] : null;
    const initialProgress = initialGpsPosition ? findNearestRouteProgress(initialGpsPosition, selectedRoute.coordinates) : null;
    resetNavigationTrackingRefs();
    lastGpsPointRef.current = initialGpsPosition;

    const nextNavigation = {
      status: 'running',
      routeId: selectedRoute.id,
      currentIndex: initialProgress?.currentIndex || 0,
      segmentProgress: initialProgress?.segmentProgress || 0,
      position: initialGpsPosition,
      heading: initialProgress?.nearestCoordinate && selectedRoute.coordinates[initialProgress.currentIndex + 1]
        ? calculateHeading(initialProgress.nearestCoordinate, selectedRoute.coordinates[initialProgress.currentIndex + 1])
        : 0,
      progress: 0,
      distanceRemaining: Number(routeDistanceKm.toFixed(1)),
      etaRemaining: Number.parseInt(selectedRoute.estimatedTime, 10) || 0,
      currentSafetyStatus: initialAlert.zoneSafety,
      currentZoneSafety: initialAlert.zoneSafety,
      nextWarning: initialGpsPosition ? initialAlert.text : 'Waiting for first GPS fix.',
      alerts: [],
      timeline: [{ id: `${Date.now()}-timeline-start`, label: 'Started navigation', detail: `Navigation started on ${selectedRoute.name}.`, time: new Date().toISOString() }],
      rerouteRecommendation: '',
      summary: null,
      startedAt: new Date().toISOString(),
      totalDistanceKm: routeDistanceKm,
      completedCoordinates: initialProgress?.completedCoordinates || [],
      remainingCoordinates: initialProgress?.remainingCoordinates || selectedRoute.coordinates,
      gpsLoading: !initialGpsPosition,
      gpsError: '',
      gpsAccuracy: latestGpsRef.current?.accuracy ?? null,
    };

    navigationRef.current = nextNavigation;
    setNavigation(nextNavigation);
    setSmartAlerts([]);
    setActiveRouteId(selectedRoute.id);
    startWatchingLocation();
    if (initialGpsPosition) {
      requestAnimationFrame(() => updateLiveNavigationFromGps(initialGpsPosition, latestGpsRef.current?.accuracy));
    }
    showToast('Live navigation started.', 'success', 2500);
  };

  const pauseNavigation = () => {
    setNavigation((prev) => {
      if (prev.status === 'running') {
        return {
          ...prev,
          status: 'paused',
          nextWarning: 'Navigation paused. Press Resume to continue.',
          timeline: [...prev.timeline, { id: `${Date.now()}-paused`, label: 'Navigation paused', detail: 'Movement has been paused by the user.', time: new Date().toISOString() }],
        };
      }

      if (prev.status === 'paused') {
        startWatchingLocation({ forceRefresh: true });
        return {
          ...prev,
          status: 'running',
          nextWarning: 'Navigation resumed.',
          timeline: [...prev.timeline, { id: `${Date.now()}-resumed`, label: 'Navigation resumed', detail: 'Movement has resumed on the selected route.', time: new Date().toISOString() }],
        };
      }

      return prev;
    });
  };

  const stopNavigation = () => {
    if (markerAnimationRef.current) {
      cancelAnimationFrame(markerAnimationRef.current);
      markerAnimationRef.current = null;
    }
    resetNavigationTrackingRefs();
    setSmartAlerts([]);
    setNavigation((prev) => ({
      ...prev,
      status: 'stopped',
      currentIndex: 0,
      segmentProgress: 0,
      progress: 0,
      distanceRemaining: 0,
      etaRemaining: null,
      nextWarning: 'Navigation stopped by the user.',
      currentSafetyStatus: 'Stopped',
      currentZoneSafety: 'Stopped',
      alerts: [],
      rerouteRecommendation: '',
      summary: null,
      gpsLoading: false,
      gpsError: '',
      completedCoordinates: [],
      remainingCoordinates: [],
      timeline: [...prev.timeline, { id: `${Date.now()}-stopped`, label: 'Navigation stopped', detail: 'Live movement has been stopped.', time: new Date().toISOString() }],
    }));
    showToast('Navigation stopped.', 'info', 2200);
  };

  const handleMapContextMenu = (location) => {
    setIncidentLocation(location);
    setIsIncidentModalOpen(true);
  };

  const handleIncidentReportSuccess = (newIncident) => {
    // Refresh map markers/heatmap immediately instead of waiting for the
    // next 10s poll. The modal itself already shows a success toast with
    // the AI-detected severity, so we don't duplicate it here.
    addIncident(newIncident);
    setIsIncidentModalOpen(false);
  };

  const handleIncidentModalClose = () => {
    setIsIncidentModalOpen(false);
    setIncidentLocation(null);
  };

  return (
    <>
      <SmartAlertToast alerts={smartAlerts} onDismiss={dismissSmartAlert} />

      {/* Home is the hero experience: the map fills the screen, and every
          control is a compact floating overlay on top of it (Google Maps
          style) instead of permanent side columns. */}
      <div className="relative h-[calc(100vh-70px-64px)] w-full overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[0_0_20px_rgba(255,45,120,0.08)]">
        <div className="absolute inset-0">
          <MapView
            source={source}
            destination={destination}
            currentLocation={currentLocation}
            routes={routes}
            activeRouteId={activeRouteId || routes[0]?.id}
            incidents={incidents}
            onContextMenu={handleMapContextMenu}
            navigation={navigation}
            onMapClick={handleMapClick}
            selectedSourceMarker={source}
            selectedDestinationMarker={destination}
          />
        </div>

        {/* Top overlay: collapsible route input + (once searched) route
            results, stacked in one scrollable column so it never fights
            other corners for space. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1200] flex justify-center p-3">
          <div className="pointer-events-auto flex max-h-[calc(100vh-70px-64px-1.5rem)] w-full max-w-md flex-col gap-2 overflow-y-auto custom-scrollbar">
            {/* Route Input (collapsible) */}
            <div className="glass-card flex flex-col gap-4">
              <button
                type="button"
                onClick={() => setIsRouteCardExpanded((prev) => !prev)}
                className="flex items-center justify-between gap-3 text-left"
              >
                <h3 className="glass-card-header !mb-0 truncate">
                  {isRouteCardExpanded ? 'Plan a Safe Route' : `${sourceText || 'Source'} → ${destinationText || 'Destination'}`}
                </h3>
                <span className="shrink-0 text-xs text-[var(--text-secondary)]">{isRouteCardExpanded ? '▲' : '▼'}</span>
              </button>

              {isRouteCardExpanded && (
                <>
                  <div className="space-y-1">
                    <LocationAutocomplete label="Source" placeholder="Search source..." value={sourceText} onChange={handleSourceTextChange} onSelect={(location) => { cancelPendingLocateMe(); setSource(location); sourceEditedRef.current = true; }} showAccuracy={!!currentLocation} accuracy={currentLocation?.accuracy} />
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        disabled={locateMeLoading}
                        className="flex w-full items-center gap-2 truncate text-left text-[11px] font-medium uppercase tracking-wider text-[var(--primary)] underline hover:opacity-80 disabled:cursor-wait disabled:opacity-60"
                      >
                        {locateMeLoading ? (
                          <>
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--primary)]/30 border-t-[var(--primary)]" />
                            {locationMessage?.replace(/^📍|^📡/, '').trim() || 'Locating you...'}
                          </>
                        ) : (
                          '📍 Use Current Location'
                        )}
                      </button>
                      {currentLocation && !currentLocation.error && (
                        <button type="button" onClick={handleRecenterToLocation} className="text-[11px] font-medium uppercase tracking-wider text-cyan-400 underline hover:opacity-80 truncate block w-full text-left">
                          🔄 Recenter to My Location
                        </button>
                      )}
                      {locationStatus === 'error' && locationMessage && (
                        <p className="text-[11px] leading-snug text-rose-300">{locationMessage}</p>
                      )}
                      {showMapClickFallback && (
                        <p className="text-[11px] leading-snug text-slate-400">
                          📌 Ya map par tap karke source set karein <span className="text-slate-500">(or tap the map to set your source)</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <LocationAutocomplete label="Destination" placeholder="Search destination..." value={destinationText} onChange={handleDestinationTextChange} onSelect={setDestination} />
                  </div>
                  <div className="mt-2 flex flex-col gap-2">
                    <button type="button" onClick={handleSearch} disabled={loading} className="btn-primary truncate">
                      {loading ? 'Analyzing...' : 'Find Safe Route'}
                    </button>
                    <button type="button" onClick={() => { setData(null); setActiveRouteId(null); }} className="btn-secondary truncate">
                      Reset
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Route results - only takes space once a search has run */}
            {routes.length > 0 && (
              <div className="glass-card">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="glass-card-header !mb-0">Route Options</h3>
                  <div className="rounded-full border border-[var(--primary)] bg-[rgba(255,45,120,0.1)] px-2 py-0.5 text-[10px] text-[var(--primary)]">{routes.length} routes</div>
                </div>
                <div className="flex flex-col gap-3">
                  {routes.map((route, idx) => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      active={route.id === activeRoute?.id}
                      onClick={() => setActiveRouteId(route.id)}
                      isRecommended={idx === 0}
                    />
                  ))}
                </div>
              </div>
            )}

            <LiveNavigationPanel
              navigation={navigation}
              route={navigateRoute}
              isLiveMode={isLiveMode}
              onToggleLiveMode={setIsLiveMode}
              onStart={() => startNavigation(navigateRoute)}
              onPause={pauseNavigation}
              onStop={stopNavigation}
            />

            {routes.length > 0 && (
              <RouteComparisonPanel routes={routes} activeRouteId={activeRoute?.id} onSelectRoute={setActiveRouteId} />
            )}
          </div>
        </div>

        {/* Safety Legend - compact badge, top-right corner */}
        <div className="pointer-events-none absolute right-3 top-3 z-[1200]">
          <div className="glass-card pointer-events-auto flex flex-col gap-2 !p-3 text-[11px]">
            <div className="flex items-center gap-2"><div className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--safe-green)] shadow-[0_0_6px_var(--safe-green)]" /><span className="text-[var(--text-secondary)] font-medium">Safe (70-100)</span></div>
            <div className="flex items-center gap-2"><div className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--medium-yellow)] shadow-[0_0_6px_var(--medium-yellow)]" /><span className="text-[var(--text-secondary)] font-medium">Medium (40-69)</span></div>
            <div className="flex items-center gap-2"><div className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--unsafe-red)] shadow-[0_0_6px_var(--unsafe-red)]" /><span className="text-[var(--text-secondary)] font-medium">Unsafe (0-39)</span></div>
          </div>
        </div>

        {/* Report Incident - floating action button, bottom-left (SOS owns bottom-right globally) */}
        <button
          type="button"
          onClick={() => setIsIncidentModalOpen(true)}
          className="btn-danger pointer-events-auto absolute bottom-4 left-4 z-[1200] w-auto px-4 py-3 shadow-lg"
        >
          🚨 Report Incident
        </button>
      </div>

      <IncidentReportModal isOpen={isIncidentModalOpen} onClose={handleIncidentModalClose} location={incidentLocation} onSuccess={handleIncidentReportSuccess} />
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <GPSDebugPanel visible={showGPSDebug} />
    </>
  );
}
