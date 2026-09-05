const PHOTON_API = 'https://photon.komoot.io/api';
const NOMINATIM_API = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_API = 'https://nominatim.openstreetmap.org/reverse';

const geocodeCache = new Map(); // Cache for reverse geocoding results
const CACHE_TTL = 3600000; // 1 hour in milliseconds

export const clearGeocodeCache = () => {
  geocodeCache.clear();
};

function getCacheKey(lat, lng) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export async function reverseGeocodeWithCache(lat, lng) {
  const key = getCacheKey(lat, lng);
  const cached = geocodeCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  try {
    const url = `${NOMINATIM_REVERSE_API}?format=jsonv2&lat=${lat}&lon=${lng}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      const result = data?.address?.city || data?.address?.town || data?.address?.village || data?.display_name?.split(',')[0] || 'Location';
      geocodeCache.set(key, { result, timestamp: Date.now() });
      return result;
    }
  } catch (err) {
    console.warn('Reverse geocode failed:', err);
  }
  return 'Location';
}

/**
 * Fetch location suggestions from Photon API with fallback to Nominatim.
 * Each caller should pass its own AbortSignal (see LocationAutocomplete) so
 * that cancelling one field's in-flight search never cancels another
 * field's search — they used to share a single module-level controller.
 * @param {string} query - Search query
 * @param {number} limit - Max results (default 6)
 * @param {AbortSignal} [externalSignal] - Optional caller-owned abort signal
 * @returns {Promise<Array>} Array of location objects with name, lat, lng, address
 */
export const searchLocations = async (query, limit = 6, externalSignal) => {
  const safeQuery = typeof query === 'string' ? query.trim() : '';

  if (safeQuery.length < 2) {
    return [];
  }

  const ownController = externalSignal ? null : new AbortController();
  const signal = externalSignal || ownController?.signal;
  const timeoutId = ownController ? setTimeout(() => ownController.abort(), 5000) : null;

  try {
    // Try Photon API first (better for autocomplete)
    const photonUrl = `${PHOTON_API}?q=${encodeURIComponent(safeQuery)}&limit=${limit}&lang=en`;
    const photonResponse = await fetch(photonUrl, { signal });

    if (photonResponse.ok) {
      const data = await photonResponse.json();
      const results = (data?.features || []).map((feature) => {
        const properties = feature?.properties || {};
        const coordinates = feature?.geometry?.coordinates || [];
        const [lng, lat] = coordinates;
        const name = properties.name || '';
        const city = properties.city || '';
        const country = properties.country || '';
        const address = [name, city, country].filter(Boolean).join(', ');

        return {
          name: name || city || country || 'Location',
          lat: Number(lat),
          lng: Number(lng),
          address: address || name || city || 'Location',
          source: 'photon',
        };
      }).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

      if (results.length > 0) {
        return results;
      }
    }

    // Fallback to Nominatim
    const nominatimUrl = `${NOMINATIM_API}?q=${encodeURIComponent(safeQuery)}&format=jsonv2&limit=${limit}&countrycodes=in&addressdetails=1`;
    const nominatimResponse = await fetch(nominatimUrl, { signal });

    if (nominatimResponse.ok) {
      const data = await nominatimResponse.json();
      const results = (data || []).map((item) => {
        const city = item?.address?.city || item?.address?.town || item?.address?.village || '';
        const name = item?.name || item?.display_name?.split(',')?.[0] || 'Location';
        const lat = Number(item?.lat);
        const lng = Number(item?.lon);
        const address = city ? `${name}, ${city}` : name;

        return {
          name: city || name,
          lat,
          lng,
          address,
          source: 'nominatim',
        };
      }).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

      if (results.length > 0) {
        return results;
      }
    }

    return [];
  } catch (err) {
    if (err?.name === 'AbortError') {
      console.warn('Location search cancelled');
    } else {
      console.error('Location search error:', err);
    }
    return [];
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

/**
 * Get address from coordinates (reverse geocoding)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<string|null>} Address string or null
 */
export const getReverseGeocodeAddress = async (lat, lng) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
      return data?.display_name || null;
    }

    return null;
  } catch (error) {
    console.error('[LOCATION] Reverse geocode failed:', error);
    return null;
  }
};
