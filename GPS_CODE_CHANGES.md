# GPS Accuracy Fix - Corrected Code Sections

## 1️⃣ GPS Manager Service (NEW FILE)
**Location**: `frontend/src/services/gpsManager.js`

This is a NEW service file with all the high-accuracy GPS detection logic.

### Key Features:
```javascript
// High accuracy settings
export const GPS_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 25000,        // ← Was 10000 (10s), now 25s
  maximumAge: 0,
};

// Accuracy threshold
const ACCURACY_THRESHOLD = 80;  // ← Rejects readings > 80m

// Create GPS manager
const gpsManager = createGPSManager(onUpdate, onError);
gpsManager.start();
gpsManager.stop();
gpsManager.getReading();
```

**Download**: Copy the full `gpsManager.js` file created above.

---

## 2️⃣ Home.jsx - IMPORTS
**Location**: `frontend/src/pages/Home.jsx` (Top of file)

### BEFORE:
```javascript
import { reverseGeocodeCoordinates } from '../services/routing';
```

### AFTER:
```javascript
import { reverseGeocodeCoordinates } from '../services/routing';
import {
  createGPSManager,
  GPS_OPTIONS,
  reverseGeocodeCoordinatesForDisplay,
  getAccurateSourceForRouting,
  getDeviceTypeHint,
} from '../services/gpsManager';
```

---

## 3️⃣ Home.jsx - GPS OPTIONS CONSTANT
**Location**: `frontend/src/pages/Home.jsx` (Line ~27)

### BEFORE:
```javascript
const GEOLOCATION_UNSUPPORTED_MESSAGE = 'Geolocation not supported in this browser.';
const GPS_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
};
```

### AFTER:
```javascript
const GEOLOCATION_UNSUPPORTED_MESSAGE = 'Geolocation not supported in this browser.';
// GPS_OPTIONS now imported from gpsManager service (no need to define here)
```

---

## 4️⃣ Home.jsx - REMOVE OLD REFS
**Location**: `frontend/src/pages/Home.jsx` (Line ~181)

### BEFORE:
```javascript
const [locationMessage, setLocationMessage] = useState('');
const watcherRef = useRef(null);
const bestAccuracyRef = useRef(Number.POSITIVE_INFINITY);
const [testLoading, setTestLoading] = useState(false);
```

### AFTER:
```javascript
const [locationMessage, setLocationMessage] = useState('');
const [testLoading, setTestLoading] = useState(false);
// watcherRef and bestAccuracyRef removed (managed by gpsManager now)
```

---

## 5️⃣ Home.jsx - ADD GPS MANAGER REF
**Location**: `frontend/src/pages/Home.jsx` (Line ~205)

### ADD THIS:
```javascript
const gpsManagerRef = useRef(null);  // ← Add this line

// After existing refs:
useEffect(() => {
  navigationRef.current = navigation;
}, [navigation]);
```

---

## 6️⃣ Home.jsx - REPLACE startWatchingLocation()
**Location**: `frontend/src/pages/Home.jsx` (Around line 500-600)

### BEFORE:
```javascript
const startWatchingLocation = ({ forceRefresh = false } = {}) => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    setLocationStatus('unsupported');
    setLocationMessage(GEOLOCATION_UNSUPPORTED_MESSAGE);
    setNavigation((prev) => ({ ...prev, gpsLoading: false, gpsError: GEOLOCATION_UNSUPPORTED_MESSAGE }));
    return null;
  }

  if (watcherRef.current && forceRefresh) {
    navigator.geolocation.clearWatch(watcherRef.current);
    watcherRef.current = null;
  }

  if (watcherRef.current && !forceRefresh) return watcherRef.current;

  setLocationStatus('detecting');
  setLocationMessage('📍 Detecting current location...');
  bestAccuracyRef.current = Number.POSITIVE_INFINITY;

  const success = async (position) => {
    const lat = Number(position.coords.latitude);
    const lng = Number(position.coords.longitude);
    const accuracy = Number(position.coords.accuracy ?? 99999);
    const navigationActive = navigationRef.current.status === 'running';

    const previousGps = latestGpsRef.current;
    const previousPoint = previousGps ? [previousGps.lat, previousGps.lng] : null;
    const currentPoint = [lat, lng];
    const gpsDeltaKm = previousPoint ? haversineDistanceKm(previousPoint, currentPoint) : Number.POSITIVE_INFINITY;
    const accuracyImproved = accuracy < bestAccuracyRef.current;

    if (previousGps && gpsDeltaKm < GPS_MIN_MOVEMENT_KM && !accuracyImproved) {
      return;
    }

    if (accuracyImproved) {
      bestAccuracyRef.current = accuracy;
    }

    let address = latestGpsRef.current?.address || `Current location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    if (!navigationActive) {
      try {
        address = await reverseGeocodeCoordinates(lat, lng);
      } catch (err) {
        console.warn('Reverse geocode failed', err);
      }
    }
    address = String(address ?? `Current location (${lat.toFixed(5)}, ${lng.toFixed(5)})`).trim();

    const detectedLocation = { lat, lng, accuracy, address };
    latestGpsRef.current = detectedLocation;
    setCurrentLocation(detectedLocation);
    setLocationMessage(`GPS Accuracy: ${Math.round(accuracy)} meters`);
    setLocationStatus(accuracy < 50 ? 'detected' : 'approx');
    updateLiveNavigationFromGps([lat, lng], accuracy);

    if (!navigationActive && (forceRefresh || !sourceEditedRef.current)) {
      setSourceText(detectedLocation.address);
      setSource({ ...detectedLocation, name: detectedLocation.address });
    }
  };

  const error = (err) => {
    console.error('Geolocation error', err);
    stopWatchingLocation();
    if (err?.code === err.PERMISSION_DENIED) {
      setLocationStatus('denied');
      setLocationMessage('❌ Location permission denied. Manual source entry is still available.');
      setNavigation((prev) => ({ ...prev, gpsLoading: false, gpsError: 'Location permission denied.' }));
      alert('Location permission denied or unavailable');
    } else if (err?.code === err.TIMEOUT) {
      setLocationStatus('timeout');
      setLocationMessage('❌ Location request timed out. Please enter the source manually.');
      setNavigation((prev) => ({ ...prev, gpsLoading: false, gpsError: 'Location request timed out.' }));
      alert('Location permission denied or unavailable');
    } else {
      setLocationStatus('error');
      setLocationMessage('❌ Failed to fetch location. Please enter the source manually.');
      setNavigation((prev) => ({ ...prev, gpsLoading: false, gpsError: 'Failed to fetch location.' }));
      alert('Location permission denied or unavailable');
    }
  };

  const id = navigator.geolocation.watchPosition(success, error, GPS_OPTIONS);
  watcherRef.current = id;
  return id;
};
```

### AFTER:
```javascript
const startWatchingLocation = ({ forceRefresh = false } = {}) => {
  if (gpsManagerRef.current && forceRefresh) {
    gpsManagerRef.current.stop();
    gpsManagerRef.current = null;
  }

  if (gpsManagerRef.current && !forceRefresh) {
    console.log('[GPS] Already watching, reusing manager');
    return;
  }

  console.log('[GPS] Creating new GPS manager with high-accuracy settings');
  const deviceType = getDeviceTypeHint();
  console.log('[GPS] Device type detected:', deviceType);

  if (deviceType === 'desktop') {
    console.warn('[GPS] Desktop device - WiFi location may be approximate');
  }

  setLocationStatus('detecting');
  setLocationMessage('📍 Detecting current location with high accuracy...');

  const gpsManager = createGPSManager(
    // onUpdate callback
    async (reading) => {
      const { lat, lng, accuracy } = reading;
      console.log('[GPS] Position update received:', { lat: lat.toFixed(5), lng: lng.toFixed(5), accuracy: Math.round(accuracy) });

      const navigationActive = navigationRef.current.status === 'running';
      let address = latestGpsRef.current?.address || `Current location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;

      // Only reverse geocode when NOT navigating (for display only)
      if (!navigationActive) {
        try {
          const geocodedAddress = await reverseGeocodeCoordinatesForDisplay(lat, lng);
          if (geocodedAddress) {
            address = geocodedAddress;
          }
        } catch (err) {
          console.warn('[GPS] Reverse geocode failed:', err?.message);
        }
      }

      address = String(address ?? `Current location (${lat.toFixed(5)}, ${lng.toFixed(5)})`).trim();
      const detectedLocation = { lat, lng, accuracy, address };
      latestGpsRef.current = detectedLocation;
      setCurrentLocation(detectedLocation);
      setLocationMessage(`🛰️ GPS: ±${Math.round(accuracy)}m | ${address.substring(0, 40)}${address.length > 40 ? '...' : ''}`);
      setLocationStatus(accuracy < 50 ? 'detected' : accuracy <= 80 ? 'good' : 'approx');
      updateLiveNavigationFromGps([lat, lng], accuracy);

      // Update source only if user hasn't manually edited it
      if (!navigationActive && !sourceEditedRef.current) {
        setSourceText(detectedLocation.address);
        setSource({ ...detectedLocation, name: detectedLocation.address });
      }
    },
    // onError callback
    (error) => {
      console.error('[GPS] Error:', error);
      let errorMsg = error.message || 'Location detection failed';

      if (error.permissionDenied) {
        setLocationStatus('denied');
        setLocationMessage('❌ Location permission denied. Use manual source entry.');
        setNavigation((prev) => ({ ...prev, gpsLoading: false, gpsError: 'Permission denied' }));
      } else if (error.timeout) {
        setLocationStatus('timeout');
        setLocationMessage('❌ Location detection timed out. Please enter source manually.');
        setNavigation((prev) => ({ ...prev, gpsLoading: false, gpsError: 'Timeout' }));
      } else {
        setLocationStatus('error');
        setLocationMessage('❌ Failed to get location. Manual entry available.');
        setNavigation((prev) => ({ ...prev, gpsLoading: false, gpsError: errorMsg }));
      }
    }
  );

  gpsManagerRef.current = gpsManager;
  gpsManager.start();
};
```

---

## 7️⃣ Home.jsx - REPLACE stopWatchingLocation()
**Location**: `frontend/src/pages/Home.jsx` (Around line 597)

### BEFORE:
```javascript
const stopWatchingLocation = () => {
  if (watcherRef.current) {
    navigator.geolocation.clearWatch(watcherRef.current);
    watcherRef.current = null;
  }
};
```

### AFTER:
```javascript
const stopWatchingLocation = () => {
  if (gpsManagerRef.current) {
    gpsManagerRef.current.stop();
    gpsManagerRef.current = null;
  }
};
```

---

## 8️⃣ Home.jsx - REPLACE getSourceForRouting()
**Location**: `frontend/src/pages/Home.jsx` (Around line 610)

### BEFORE:
```javascript
const getSourceForRouting = () => {
  if (!sourceEditedRef.current && currentLocation && Number.isFinite(currentLocation.lat) && Number.isFinite(currentLocation.lng)) {
    return { sourceCoords: { lat: currentLocation.lat, lng: currentLocation.lng }, sourceAddress: currentLocation.address };
  }
  if (source && Number.isFinite(source.lat) && Number.isFinite(source.lng)) {
    return source; // Pass the location object directly - has lat, lng
  }
  return String(sourceText ?? source?.name ?? source ?? '').trim();
};
```

### AFTER:
```javascript
const getSourceForRouting = () => {
  // CRITICAL: Use direct GPS coordinates for routing, never text geocoding
  const accurateSource = getAccurateSourceForRouting(
    gpsManagerRef.current?.getReading() || currentLocation,
    source,
    sourceEditedRef.current
  );

  if (accurateSource && Number.isFinite(accurateSource.lat) && Number.isFinite(accurateSource.lng)) {
    console.log('[ROUTING] Source from accurate GPS:', {
      lat: accurateSource.lat.toFixed(5),
      lng: accurateSource.lng.toFixed(5),
      accuracy: accurateSource.accuracy ? Math.round(accurateSource.accuracy) : 'unknown',
    });
    // Return in format that fetchSafeRoute expects
    return {
      sourceCoords: { lat: accurateSource.lat, lng: accurateSource.lng },
      sourceAddress: source?.address || currentLocation?.address || 'Current location',
    };
  }

  if (source && Number.isFinite(source.lat) && Number.isFinite(source.lng)) {
    console.log('[ROUTING] Source from manual selection');
    return source; // Pass the location object directly
  }

  const textSource = String(sourceText ?? source?.name ?? source ?? '').trim();
  console.log('[ROUTING] Source from text input:', textSource);
  return textSource;
};
```

---

## Summary of Changes

| File | Change | Reason |
|------|--------|--------|
| `gpsManager.js` | NEW FILE | High-accuracy GPS detection with caching |
| `Home.jsx` | Import GPS manager | Use managed GPS instead of raw API |
| `Home.jsx` | Remove `watcherRef` | GPS manager handles watching |
| `Home.jsx` | Remove `bestAccuracyRef` | GPS manager handles accuracy tracking |
| `Home.jsx` | Add `gpsManagerRef` | Store GPS manager instance |
| `Home.jsx` | Update `startWatchingLocation()` | Use GPS manager instead of raw geolocation |
| `Home.jsx` | Update `stopWatchingLocation()` | Stop GPS manager instead of raw watcher |
| `Home.jsx` | Update `getSourceForRouting()` | Use accurate GPS, never re-geocode |
| `routing.js` | No changes needed | Already supports `sourceCoords` |

---

## ✅ Verification After Changes

1. **GPS Detection**: Should take 20-25 seconds, show ±30-80m accuracy
2. **Map Marker**: Appears at exact GPS location
3. **Route Start**: Matches marker position exactly
4. **No Re-geocoding**: Console shows `[ROUTING] Source from accurate GPS`
5. **Desktop Warning**: Shows "WiFi location may be approximate"
6. **Navigation**: Smooth GPS tracking during active route

All fixes are now applied! 🎉
