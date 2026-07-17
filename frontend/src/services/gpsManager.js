/**
 * GPS Manager Service
 * High-accuracy GPS detection with smart coordinate caching and accuracy filtering.
 * Always uses direct GPS coordinates for routing, never re-geocodes GPS source.
 */

const ACCURACY_THRESHOLD = 80; // meters - reject worse readings
const GPS_UPDATE_MIN_MOVEMENT = 0.01; // km
const GPS_TIMEOUT = 25000; // ms - increased from 10s
const MAX_GPS_WAIT_ATTEMPTS = 3;

export const GPS_OPTIONS = {
  enableHighAccuracy: true,
  timeout: GPS_TIMEOUT,
  maximumAge: 0, // Do not use cached position
};

/**
 * Calculate haversine distance between two coordinates
 */
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

/**
 * Validate if a position has acceptable accuracy
 */
export function isAcceptableAccuracy(accuracy) {
  return Number.isFinite(accuracy) && accuracy <= ACCURACY_THRESHOLD;
}

/**
 * Get device type hint for GPS accuracy expectations
 */
export function getDeviceTypeHint() {
  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(ua);
  return isMobile ? 'mobile' : 'desktop';
}

/**
 * GPS Cache - stores best GPS reading
 */
class GPSCache {
  constructor() {
    this.bestReading = null;
    this.bestAccuracy = Number.POSITIVE_INFINITY;
    this.readingTimestamp = null;
  }

  /**
   * Update cache if new reading is better
   */
  updateIfBetter(position) {
    const lat = Number(position.coords.latitude);
    const lng = Number(position.coords.longitude);
    const accuracy = Number(position.coords.accuracy ?? 99999);

    const isValidCoordinate = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
    if (!isValidCoordinate) {
      console.warn('[GPS] Invalid coordinates rejected:', { lat, lng });
      return null;
    }

    // Reject bad accuracy readings
    if (!isAcceptableAccuracy(accuracy)) {
      console.warn('[GPS] Accuracy too poor, rejected:', {
        accuracy,
        threshold: ACCURACY_THRESHOLD,
      });
      return null;
    }

    // Check if it's better than previous
    if (accuracy < this.bestAccuracy) {
      const oldAccuracy = this.bestAccuracy;
      this.bestReading = { lat, lng, accuracy };
      this.bestAccuracy = accuracy;
      this.readingTimestamp = Date.now();

      console.log('[GPS] ✅ Better reading accepted:', {
        lat: lat.toFixed(5),
        lng: lng.toFixed(5),
        accuracy: Math.round(accuracy),
        previousAccuracy: oldAccuracy === Number.POSITIVE_INFINITY ? 'none' : Math.round(oldAccuracy),
      });

      return this.bestReading;
    }

    console.log('[GPS] Reading ignored, current is better:', {
      newAccuracy: Math.round(accuracy),
      currentAccuracy: Math.round(this.bestAccuracy),
    });
    return null;
  }

  /**
   * Get current best reading
   */
  getReading() {
    return this.bestReading;
  }

  /**
   * Reset cache
   */
  reset() {
    this.bestReading = null;
    this.bestAccuracy = Number.POSITIVE_INFINITY;
    this.readingTimestamp = null;
  }

  /**
   * Check if reading is stale
   */
  isStale(maxAgeMs = 60000) {
    if (!this.readingTimestamp) return true;
    return Date.now() - this.readingTimestamp > maxAgeMs;
  }
}

/**
 * Create GPS Manager instance
 */
export function createGPSManager(onUpdate, onError) {
  const cache = new GPSCache();
  let watcherId = null;
  let waitAttempts = 0;
  let isWatching = false;

  const log = (message, data = {}) => {
    console.log(`[GPS Manager] ${message}`, data);
  };

  const handleSuccess = (position) => {
    const updatedReading = cache.updateIfBetter(position);

    if (updatedReading) {
      // Good reading received
      waitAttempts = 0;
      onUpdate(updatedReading);
    } else if (cache.bestReading) {
      // Reading rejected but we have a previous good one, call with current cached
      log('Using cached reading');
      onUpdate(cache.bestReading);
    } else {
      // Still waiting for first good reading
      waitAttempts += 1;
      log(`Waiting for acceptable accuracy (attempt ${waitAttempts}/${MAX_GPS_WAIT_ATTEMPTS})`);

      if (waitAttempts >= MAX_GPS_WAIT_ATTEMPTS && cache.bestAccuracy !== Number.POSITIVE_INFINITY) {
        // Use best reading found so far even if not ideal
        log('Using best available reading after max attempts', {
          accuracy: Math.round(cache.bestAccuracy),
        });
        onUpdate(cache.bestReading);
      }
    }
  };

  const handleError = (err) => {
    let errorMessage = 'Unknown location error';
    let isPermissionDenied = false;

    if (err?.code === err.PERMISSION_DENIED) {
      errorMessage = 'Location permission denied';
      isPermissionDenied = true;
    } else if (err?.code === err.TIMEOUT) {
      errorMessage = 'Location detection timed out';
    } else if (err?.code === err.POSITION_UNAVAILABLE) {
      errorMessage = 'Location position unavailable';
    }

    log('❌ ' + errorMessage, { code: err?.code });
    onError({
      message: errorMessage,
      permissionDenied: isPermissionDenied,
      timeout: err?.code === err.TIMEOUT,
    });
  };

  return {
    /**
     * Start watching GPS position
     */
    start() {
      if (isWatching) {
        log('Already watching position');
        return;
      }

      log('Starting GPS watch with high accuracy (timeout: ' + GPS_TIMEOUT + 'ms)');
      cache.reset();
      waitAttempts = 0;

      if (!navigator.geolocation) {
        onError({ message: 'Geolocation not supported', permissionDenied: false });
        return;
      }

      isWatching = true;
      watcherId = navigator.geolocation.watchPosition(handleSuccess, handleError, GPS_OPTIONS);
      log('Watch ID: ' + watcherId);
    },

    /**
     * Stop watching GPS position
     */
    stop() {
      if (watcherId !== null) {
        log('Stopping GPS watch (ID: ' + watcherId + ')');
        navigator.geolocation.clearWatch(watcherId);
        watcherId = null;
        isWatching = false;
      }
    },

    /**
     * Get current best GPS reading
     */
    getReading() {
      return cache.getReading();
    },

    /**
     * Manually set reading (for testing or fallback)
     */
    setReading(lat, lng, accuracy = 0) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        log('❌ Invalid manual reading coordinates');
        return null;
      }

      const reading = { lat, lng, accuracy };
      cache.bestReading = reading;
      cache.bestAccuracy = accuracy;
      cache.readingTimestamp = Date.now();

      log('Manual reading set:', { lat: lat.toFixed(5), lng: lng.toFixed(5), accuracy });
      return reading;
    },

    /**
     * Check if cache is stale
     */
    isStale(maxAgeMs) {
      return cache.isStale(maxAgeMs);
    },

    /**
     * Get manager state
     */
    getState() {
      return {
        isWatching,
        watcherId,
        reading: cache.getReading(),
        accuracy: cache.bestAccuracy,
        timestamp: cache.readingTimestamp,
      };
    },
  };
}

/**
 * Reverse geocode coordinates (for address display only)
 * Should NEVER be used for routing - routing must use raw GPS coordinates
 */
export async function reverseGeocodeCoordinatesForDisplay(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.warn('[GPS] Reverse geocode failed (status: ' + response.status + ')');
      return null;
    }

    const payload = await response.json();
    const address = payload?.display_name || null;

    if (address) {
      console.log('[GPS] Reverse geocoded address:', address.substring(0, 80));
    }

    return address;
  } catch (err) {
    console.warn('[GPS] Reverse geocode error:', err?.message);
    return null;
  }
}

/**
 * Format GPS reading for display
 */
export function formatGPSReading(reading) {
  if (!reading) return 'No GPS data';
  const { lat, lng, accuracy } = reading;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)} (±${Math.round(accuracy)}m)`;
}

/**
 * Get accurate source coordinates for routing
 * Always returns direct GPS coordinates, NEVER geocoded text
 */
export function getAccurateSourceForRouting(gpsReading, sourceLocation, sourceEditedByUser) {
  // If user has manually edited the source, use it as-is
  if (sourceEditedByUser && sourceLocation && Number.isFinite(sourceLocation.lat) && Number.isFinite(sourceLocation.lng)) {
    console.log('[ROUTING] Using manually selected source:', {
      lat: sourceLocation.lat.toFixed(5),
      lng: sourceLocation.lng.toFixed(5),
    });
    return sourceLocation;
  }

  // Use live GPS if available
  if (gpsReading && Number.isFinite(gpsReading.lat) && Number.isFinite(gpsReading.lng)) {
    console.log('[ROUTING] Using live GPS for source:', {
      lat: gpsReading.lat.toFixed(5),
      lng: gpsReading.lng.toFixed(5),
      accuracy: Math.round(gpsReading.accuracy),
    });
    return {
      lat: gpsReading.lat,
      lng: gpsReading.lng,
      accuracy: gpsReading.accuracy,
    };
  }

  // Fallback to manually set location
  if (sourceLocation && Number.isFinite(sourceLocation.lat) && Number.isFinite(sourceLocation.lng)) {
    console.log('[ROUTING] Using fallback source:', {
      lat: sourceLocation.lat.toFixed(5),
      lng: sourceLocation.lng.toFixed(5),
    });
    return sourceLocation;
  }

  console.warn('[ROUTING] No valid source coordinates available');
  return null;
}
