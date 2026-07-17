/**
 * Production-grade GPS Location Service
 * Handles watchPosition, accuracy filtering, retry logic, and fallback strategies
 */

// Accepting a fix up to 30s old (instead of forcing a brand-new one every
// time) is what actually fixes most desktop/laptop timeouts, since those
// machines have no GPS chip and rely on slow WiFi/IP geolocation.
const GPS_CONFIG_HIGH_ACCURACY = {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 30000,
};

// Fallback used once high-accuracy has failed with TIMEOUT/POSITION_UNAVAILABLE
// (never for PERMISSION_DENIED, which no accuracy setting can fix). Low
// accuracy WiFi/IP location is fine for picking a route starting point.
const GPS_CONFIG_LOW_ACCURACY = {
  enableHighAccuracy: false,
  timeout: 15000,
  maximumAge: 60000,
};

const ACCURACY_THRESHOLD = 100; // meters
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000; // milliseconds
const STALE_LOCATION_AGE = 60000; // 1 minute

/**
 * Calculate haversine distance between coordinates
 */
function haversineDistanceMeters(coord1, coord2) {
  if (!coord1 || !coord2) return Infinity;
  const toRadians = (deg) => (deg * Math.PI) / 180;
  const R = 6371000; // Earth radius in meters
  const lat1 = toRadians(coord1.lat);
  const lat2 = toRadians(coord2.lat);
  const dLat = toRadians(coord2.lat - coord1.lat);
  const dLng = toRadians(coord2.lng - coord1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Detect device type
 */
function getDeviceType() {
  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(ua);
  return isMobile ? 'mobile' : 'desktop';
}

/**
 * GPS Service - Production-grade location management
 */
class GPSService {
  constructor() {
    this.watcherId = null;
    this.isWatching = false;
    this.currentLocation = null;
    this.bestAccuracy = Infinity;
    this.listeners = [];
    this.retryCount = 0;
    this.lastRequestTime = null;
    this.debugMode = false;
    this.deviceType = getDeviceType();
    this.lastNotifyTime = 0; // Throttle notifications to max 1 per 500ms
    // Once high-accuracy GPS times out / is unavailable (e.g. a laptop with
    // no GPS chip), stop asking for it and stick to WiFi/IP-based location.
    this.usingLowAccuracy = false;
  }

  getActiveConfig() {
    return this.usingLowAccuracy ? GPS_CONFIG_LOW_ACCURACY : GPS_CONFIG_HIGH_ACCURACY;
  }

  log(level, message, data = {}) {
    // GPS updates can fire continuously - only real errors are worth
    // surfacing in production. Everything else requires debugMode.
    if (level !== 'error' && !this.debugMode) return;

    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const prefix = `[GPS ${timestamp}]`;
    const logData = Object.keys(data).length > 0 ? data : '';

    if (level === 'info') {
      console.log(`${prefix} ℹ️ ${message}`, logData);
    } else if (level === 'warn') {
      console.warn(`${prefix} ⚠️ ${message}`, logData);
    } else if (level === 'error') {
      console.error(`${prefix} ❌ ${message}`, logData);
    } else if (level === 'success') {
      console.log(`${prefix} ✅ ${message}`, logData);
    } else if (level === 'debug' && this.debugMode) {
      console.debug(`${prefix} 🔍 ${message}`, logData);
    }
  }

  /**
   * Subscribe to location updates
   */
  subscribe(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
      // Immediately call with current location if available
      if (this.currentLocation) {
        callback(this.currentLocation);
      }
    }
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Notify all subscribers (throttled to max 1 per 500ms to reduce lag)
   */
  notifyListeners() {
    const now = Date.now();
    // Skip if called too frequently - throttle to 500ms intervals
    if (now - this.lastNotifyTime < 500) {
      return;
    }
    this.lastNotifyTime = now;
    
    this.listeners.forEach((callback) => {
      try {
        callback(this.currentLocation);
      } catch (err) {
        this.log('error', 'Listener error', { error: err.message });
      }
    });
  }

  /**
   * Start watching GPS location
   */
  start() {
    if (this.isWatching) {
      this.log('warn', 'GPS already watching');
      return;
    }

    if (!navigator.geolocation) {
      this.log('error', 'Geolocation not supported');
      this.currentLocation = { error: 'Geolocation not supported', source: 'error' };
      this.notifyListeners();
      return;
    }

    this.log('info', 'Starting GPS watch', { device: this.deviceType });
    this.isWatching = true;
    this.lastRequestTime = Date.now();
    this.retryCount = 0;
    this.bestAccuracy = Infinity;
    this.usingLowAccuracy = false;

    // Request permission explicitly (required for HTTPS/secure contexts)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.log('success', 'Initial GPS permission granted, starting watch');
        this.handleSuccess(position);
        this.watcherId = navigator.geolocation.watchPosition(
          (position) => this.handleSuccess(position),
          (error) => this.handleError(error),
          this.getActiveConfig()
        );
      },
      (error) => {
        this.log('error', 'GPS permission denied or unavailable', { code: error.code });
        if (error.code !== error.PERMISSION_DENIED) {
          // High accuracy already failed once (common on desktops/laptops
          // with no GPS chip) - go straight to WiFi/IP-based location for
          // the continuous watch instead of repeating the same failure.
          this.usingLowAccuracy = true;
        }
        this.handleError(error);
        // Still try to start watch in case permission is granted later
        this.watcherId = navigator.geolocation.watchPosition(
          (position) => this.handleSuccess(position),
          (error) => this.handleError(error),
          this.getActiveConfig()
        );
      },
      this.getActiveConfig()
    );
  }

  /**
   * Stop watching GPS location
   */
  stop() {
    if (this.watcherId !== null) {
      navigator.geolocation.clearWatch(this.watcherId);
      this.watcherId = null;
      this.isWatching = false;
      this.log('info', 'GPS watch stopped');
    }
  }

  /**
   * Clear and recreate the active watchPosition using the current
   * (possibly just-downgraded) accuracy config.
   */
  restartWatch() {
    if (this.watcherId !== null) {
      navigator.geolocation.clearWatch(this.watcherId);
      this.watcherId = null;
    }
    if (!this.isWatching) return;
    this.watcherId = navigator.geolocation.watchPosition(
      (position) => this.handleSuccess(position),
      (error) => this.handleError(error),
      this.getActiveConfig()
    );
  }

  /**
   * Handle successful GPS position
   */
  handleSuccess(position) {
    const lat = Number(position.coords.latitude);
    const lng = Number(position.coords.longitude);
    const accuracy = Number(position.coords.accuracy ?? 9999);
    const timestamp = Date.now();

    // Validate coordinates
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
      this.log('error', 'Invalid coordinates received', { lat, lng });
      return;
    }

    this.log('debug', 'Raw GPS reading', { lat: lat.toFixed(5), lng: lng.toFixed(5), accuracy: Math.round(accuracy) });

    // Check accuracy threshold
    if (accuracy > ACCURACY_THRESHOLD) {
      this.log('warn', 'Accuracy too poor, waiting for better reading', {
        accuracy: Math.round(accuracy),
        threshold: ACCURACY_THRESHOLD,
      });

      // Store as fallback if first reading
      if (!this.currentLocation || this.currentLocation.source === 'error') {
        this.currentLocation = {
          lat,
          lng,
          accuracy,
          timestamp,
          source: 'gps-poor',
          status: 'low-accuracy',
        };
      }
      return;
    }

    // If current reading is better than our best, update
    if (accuracy < this.bestAccuracy) {
      this.bestAccuracy = accuracy;
      this.retryCount = 0; // Reset retries on good reading

      this.currentLocation = {
        lat,
        lng,
        accuracy,
        timestamp,
        source: 'gps',
        status: this.getAccuracyStatus(accuracy),
      };

      this.log('success', 'GPS position acquired', {
        lat: lat.toFixed(5),
        lng: lng.toFixed(5),
        accuracy: Math.round(accuracy),
        status: this.currentLocation.status,
      });

      this.notifyListeners();
    } else {
      this.log('debug', 'Better reading already cached', {
        newAccuracy: Math.round(accuracy),
        bestAccuracy: Math.round(this.bestAccuracy),
      });
    }
  }

  /**
   * Handle GPS error
   */
  handleError(error) {
    let errorMessage = 'Unknown error';
    let errorCode = 'unknown';

    if (error.code === error.PERMISSION_DENIED) {
      errorMessage = 'Location permission denied';
      errorCode = 'permission-denied';
      this.log('error', errorMessage);
    } else if (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) {
      errorMessage = error.code === error.TIMEOUT ? 'GPS timeout' : 'Position unavailable';
      errorCode = error.code === error.TIMEOUT ? 'timeout' : 'unavailable';
      this.log('warn', errorMessage, { retries: this.retryCount, usingLowAccuracy: this.usingLowAccuracy });

      if (!this.usingLowAccuracy) {
        // First failure at high accuracy - most desktops/laptops have no
        // GPS chip, so keep retrying the same high-accuracy request is
        // pointless. Fall back to WiFi/IP-based low-accuracy location,
        // which is fine for picking a route starting point.
        this.usingLowAccuracy = true;
        this.log('info', 'Falling back to low-accuracy (WiFi/IP) location');
        this.restartWatch();
      } else if (this.retryCount < MAX_RETRIES) {
        this.retryCount += 1;
        this.log('info', 'Retrying GPS...', { attempt: this.retryCount });
        setTimeout(() => this.restartWatch(), RETRY_DELAY);
      }
    }

    this.currentLocation = {
      error: errorMessage,
      errorCode,
      source: 'error',
      status: 'error',
      timestamp: Date.now(),
    };

    this.notifyListeners();
  }

  /**
   * Get accuracy status label
   */
  getAccuracyStatus(accuracy) {
    if (accuracy <= 20) return 'high';
    if (accuracy <= 50) return 'good';
    if (accuracy <= 100) return 'acceptable';
    return 'low';
  }

  /**
   * Get current location
   */
  getLocation() {
    return this.currentLocation;
  }

  /**
   * Manually inject GPS coordinates (for testing/debugging)
   */
  injectManualLocation(lat, lng, accuracy = 10) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      this.log('error', 'Invalid manual coordinates', { lat, lng });
      return false;
    }

    const timestamp = Date.now();
    this.currentLocation = {
      lat: Number(lat),
      lng: Number(lng),
      accuracy: Number(accuracy),
      timestamp,
      source: 'manual',
      status: 'high',
    };

    this.log('success', 'Manual location injected', {
      lat: lat.toFixed(6),
      lng: lng.toFixed(6),
      accuracy: Math.round(accuracy),
    });

    this.notifyListeners();
    return true;
  }

  /**
   * Force refresh GPS location
   */
  async forceRefresh() {
    this.log('info', 'Force refresh requested');
    this.stop();
    // Wait a moment before restarting
    await new Promise((resolve) => setTimeout(resolve, 500));
    this.bestAccuracy = Infinity;
    this.retryCount = 0;
    this.start();
  }

  /**
   * Check if location is stale
   */
  isStale() {
    if (!this.currentLocation || !this.currentLocation.timestamp) return true;
    return Date.now() - this.currentLocation.timestamp > STALE_LOCATION_AGE;
  }

  /**
   * Get location as routing coordinates (no text geocoding)
   */
  getRoutingCoordinates() {
    if (!this.currentLocation || this.currentLocation.error) {
      return null;
    }

    if (!Number.isFinite(this.currentLocation.lat) || !Number.isFinite(this.currentLocation.lng)) {
      return null;
    }

    return {
      lat: this.currentLocation.lat,
      lng: this.currentLocation.lng,
      accuracy: this.currentLocation.accuracy,
    };
  }

  /**
   * Get location for display (with address info)
   */
  getDisplayLocation() {
    if (!this.currentLocation) return null;
    return {
      ...this.currentLocation,
      timestamp: this.currentLocation.timestamp || Date.now(),
    };
  }

  /**
   * Enable debug mode
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    this.log('info', 'Debug mode ' + (enabled ? 'enabled' : 'disabled'));
  }

  /**
   * Get service state for debugging
   */
  getState() {
    return {
      isWatching: this.isWatching,
      currentLocation: this.currentLocation,
      bestAccuracy: this.bestAccuracy,
      retryCount: this.retryCount,
      isStale: this.isStale(),
      deviceType: this.deviceType,
      listenerCount: this.listeners.length,
    };
  }
}

// Singleton instance
let gpsService = null;

/**
 * Get or create GPS service instance
 */
export function getGPSService() {
  if (!gpsService) {
    gpsService = new GPSService();
  }
  return gpsService;
}

/**
 * Start GPS service
 */
export function startGPS() {
  const service = getGPSService();
  service.start();
}

/**
 * Stop GPS service
 */
export function stopGPS() {
  const service = getGPSService();
  service.stop();
}

/**
 * Get current location
 */
export function getCurrentLocation() {
  const service = getGPSService();
  return service.getLocation();
}

/**
 * Get location for routing (direct coordinates, no geocoding)
 */
export function getRoutingLocation() {
  const service = getGPSService();
  return service.getRoutingCoordinates();
}

/**
 * Force refresh GPS
 */
export function forceRefreshGPS() {
  const service = getGPSService();
  return service.forceRefresh();
}

/**
 * Manually inject location (for testing/debugging)
 */
export function injectManualLocation(lat, lng, accuracy = 10) {
  const service = getGPSService();
  return service.injectManualLocation(lat, lng, accuracy);
}

/**
 * Subscribe to location updates
 */
export function subscribeToLocationUpdates(callback) {
  const service = getGPSService();
  return service.subscribe(callback);
}

/**
 * Check if location is stale
 */
export function isLocationStale() {
  const service = getGPSService();
  return service.isStale();
}

export default getGPSService;
