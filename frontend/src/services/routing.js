import api from '../api/client';

const OSRM_BASE = 'https://router.project-osrm.org';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_BASE = 'https://nominatim.openstreetmap.org/reverse';

const INDORE_FALLBACK = { lat: 22.7196, lng: 75.8577 };

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function average(list, key) {
  if (!list.length) return 0;
  const total = list.reduce((sum, item) => sum + Number(item?.[key] || 0), 0);
  return total / list.length;
}

function aggregateFactors(predictions, key, limit = 3) {
  const map = new Map();

  predictions.forEach((prediction) => {
    (prediction?.[key] || []).forEach((item) => {
      const label = item?.label || item?.feature || String(item || 'Unknown');
      const existing = map.get(label) || {
        label,
        feature: item?.feature || label,
        direction: item?.direction || 'neutral',
        count: 0,
        totalImportance: 0,
        totalContribution: 0,
        reason: item?.reason || '',
        value: item?.value,
      };

      existing.count += 1;
      existing.totalImportance += Number(item?.importance || item?.score || 0);
      existing.totalContribution += Number(item?.contribution || 0);
      if (!existing.reason && item?.reason) {
        existing.reason = item.reason;
      }
      map.set(label, existing);
    });
  });

  return [...map.values()]
    .map((item) => ({
      ...item,
      score: Number((Math.abs(item.totalContribution) || item.totalImportance || item.count).toFixed(4)),
      avgImportance: item.count ? Number((item.totalImportance / item.count).toFixed(4)) : 0,
      avgContribution: item.count ? Number((item.totalContribution / item.count).toFixed(4)) : 0,
    }))
    .sort((a, b) => Math.abs(b.avgContribution) - Math.abs(a.avgContribution) || b.score - a.score)
    .slice(0, limit);
}

function averageRiskBreakdown(predictions) {
  const keys = ['crime_risk', 'lighting_quality', 'women_safety', 'cctv_coverage', 'police_accessibility'];
  const result = {};

  keys.forEach((key) => {
    const values = predictions
      .map((prediction) => Number(prediction?.risk_breakdown?.[key]))
      .filter((value) => Number.isFinite(value));
    result[key] = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 50;
  });

  return result;
}

function buildRouteNarrative(score, positiveFactors, negativeFactors) {
  const positiveText = positiveFactors.length ? positiveFactors.map((item) => item.label).join(', ') : 'balanced route signals';
  const negativeText = negativeFactors.length ? negativeFactors.map((item) => item.label).join(', ') : 'limited route penalties';

  if (score >= 75) {
    return {
      riskLevel: 'low',
      safestRouteReason: `Strongest positives are ${positiveText}.`,
      avoidRouteReason: negativeFactors.length ? `Still monitor ${negativeText}.` : 'No major safety penalty dominates this route.',
      routeRecommendationText: `Recommended because the route combines strong safety signals with manageable risk. Positive factors: ${positiveText}.`,
    };
  }

  if (score >= 50) {
    return {
      riskLevel: 'moderate',
      safestRouteReason: `This route is reasonable because ${positiveText}.`,
      avoidRouteReason: negativeFactors.length ? `Caution points: ${negativeText}.` : 'No severe risk drivers were detected.',
      routeRecommendationText: `Balanced route with mixed safety signals. It is safer than most alternatives when the positive factors matter more than ${negativeText}.`,
    };
  }

  return {
    riskLevel: 'high',
    safestRouteReason: `It only becomes safer if the risks around ${negativeText} are reduced.`,
    avoidRouteReason: `Avoid if possible because ${negativeText} outweigh the positive signals.`,
    routeRecommendationText: `High-risk route. Use only when faster access is more important than safety confidence.`,
  };
}

function buildSmartBadges(route, fastestRouteId, safestRouteId) {
  const badges = [];

  if (route.id === safestRouteId) badges.push('🛡 Safest');
  if (route.id === fastestRouteId) badges.push('⚡ Fastest');
  if (route.isRecommended) badges.push('🟢 Recommended');
  if ((route.prediction?.risk_level || 'moderate') === 'high' || route.safetyScore < 40) badges.push('⚠ High Risk');
  if ((route.prediction?.risk_breakdown?.lighting_quality || 0) >= 65 && (route.prediction?.risk_breakdown?.police_accessibility || 0) >= 55) {
    badges.push('🌃 Better at Night');
  }

  return [...new Set(badges)];
}

export async function geocodePlace(query) {
  const safeQuery = typeof query === 'string' ? query.trim() : '';

  if (!safeQuery) {
    console.warn('Empty search query');
    return INDORE_FALLBACK;
  }

  const parsed = safeQuery
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));

  if (parsed.length >= 2) {
    return { lat: parsed[0], lng: parsed[1] };
  }

  const url = `${NOMINATIM_BASE}?format=jsonv2&limit=1&q=${encodeURIComponent(safeQuery)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) return INDORE_FALLBACK;

  const results = await response.json();
  if (!results?.length) return INDORE_FALLBACK;

  return {
    lat: Number(results[0].lat),
    lng: Number(results[0].lon),
  };
}

export async function reverseGeocodeCoordinates(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const url = `${NOMINATIM_REVERSE_BASE}?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Reverse geocoding failed');
  }

  const payload = await response.json();
  return payload?.display_name || null;
}

/**
 * Calculate AI-based safety score for a route.
 * Samples 3 points along the route and averages their safety predictions.
 */
/**
 * Request AI safety predictions for a route.
 * Samples up to 3 points (start, mid, end), calls `/predict` for each
 * and aggregates the results into a single prediction summary.
 */
export async function calculateRoutePrediction(coordinates, meta = {}) {
  if (!coordinates || coordinates.length < 2) {
    return {
      safety_score: 50,
      safety_label: 'Unknown',
      confidence: 0,
      top_risk_factors: [],
      feature_importance: [],
      positive_factors: [],
      negative_factors: [],
      dominant_risk: 'Mixed route signals',
      risk_breakdown: {
        crime_risk: 50,
        lighting_quality: 50,
        women_safety: 50,
        cctv_coverage: 50,
        police_accessibility: 50,
      },
      risk_level: 'moderate',
      safest_route_reason: 'Route data was too small to evaluate in detail.',
      avoid_route_reason: 'Route data was too small to evaluate in detail.',
      route_recommendation_text: 'Route data was too small to evaluate in detail.',
      ai_summary: 'Route data was too small to evaluate in detail.',
    };
  }

  // sample points
  const samplePoints = [
    coordinates[0],
    coordinates[Math.floor(coordinates.length / 2)],
    coordinates[coordinates.length - 1],
  ];

  const predictions = [];

  for (const pt of samplePoints) {
    // derive lightweight heuristics for payload based on route meta
    const distanceKm = meta.distanceKm ?? 1;
    const durationMin = meta.durationMin ?? 1;
    const nowHour = new Date().getHours();
    const time_of_day = nowHour >= 19 || nowHour < 6 ? 'Night' : nowHour >= 17 ? 'Evening' : 'Day';

    const area_type = distanceKm < 2 ? 'Market' : distanceKm < 6 ? 'Residential' : 'Highway';
    const crowd_density = distanceKm < 2 ? 'High' : distanceKm < 5 ? 'Medium' : 'Low';

    const street_light_coverage = Math.max(5, Math.round(60 - distanceKm * 4));
    const cctv_coverage = Math.max(2, Math.round(40 - distanceKm * 3));
    const incident_count = Math.max(0, Math.round(distanceKm * 2));
    const crime_rate = Math.min(100, Math.round(40 + distanceKm * 3));
    const police_distance_km = Math.max(0.1, Math.round(Math.min(10, distanceKm / 2) * 10) / 10);

    const payload = {
      area_type,
      time_of_day,
      lighting_quality: time_of_day === 'Night' && street_light_coverage < 40 ? 'Poor' : 'Good',
      crime_rate,
      crowd_density,
      incident_count,
      cctv_coverage,
      police_distance_km,
      women_safety_risk: Math.min(100, Math.round(crime_rate * 0.9)),
      street_light_coverage,
      police_station_nearby: police_distance_km <= 2 ? 1 : 0,
      ncrb_crime_intensity: crime_rate,
      real_incident_count: incident_count,
      women_incident_count: Math.round(incident_count * 0.5),
      high_severity_count: Math.round(incident_count * 0.2),
    };

    console.debug('Route prediction payload:', payload);

    try {
      const res = await api.post('/predict', payload);
      if (res?.data?.prediction) {
        console.debug('Prediction response:', res.data.prediction);
        predictions.push(res.data.prediction);
      }
    } catch (err) {
      console.warn('Safety prediction failed for point:', err);
    }
  }

  if (predictions.length === 0) {
    return {
      safety_score: 50,
      safety_label: 'Unknown',
      confidence: 0,
      top_risk_factors: [],
      feature_importance: [],
      positive_factors: [],
      negative_factors: [],
      dominant_risk: 'Mixed route signals',
      risk_breakdown: {
        crime_risk: 50,
        lighting_quality: 50,
        women_safety: 50,
        cctv_coverage: 50,
        police_accessibility: 50,
      },
      risk_level: 'moderate',
      safest_route_reason: 'Safety data could not be computed for this route.',
      avoid_route_reason: 'Safety data could not be computed for this route.',
      route_recommendation_text: 'Safety data could not be computed for this route.',
      ai_summary: 'Safety data could not be computed for this route.',
    };
  }

  // aggregate
  const avgScore = Math.round(predictions.reduce((s, p) => s + (p.safety_score || 0), 0) / predictions.length);
  const avgConfidence = Math.round((predictions.reduce((s, p) => s + (p.confidence || 0), 0) / predictions.length) * 100) / 100;
  const topRiskFactors = aggregateFactors(predictions, 'negative_factors').map((item) => item.label).slice(0, 3);
  const positiveFactors = aggregateFactors(predictions, 'positive_factors');
  const negativeFactors = aggregateFactors(predictions, 'negative_factors');
  const featureImportance = aggregateFactors(predictions, 'feature_importance', 8);
  const riskBreakdown = averageRiskBreakdown(predictions);
  const { riskLevel, safestRouteReason, avoidRouteReason, routeRecommendationText } = buildRouteNarrative(avgScore, positiveFactors, negativeFactors);
  const dominantRisk = negativeFactors[0]?.label || featureImportance[0]?.label || 'Mixed route signals';

  const safety_label = avgScore >= 70 ? 'Safe' : avgScore >= 40 ? 'Medium' : 'Unsafe';

  return {
    safety_score: avgScore,
    safety_label,
    confidence: avgConfidence,
    top_risk_factors: topRiskFactors,
    feature_importance: featureImportance,
    positive_factors: positiveFactors,
    negative_factors: negativeFactors,
    dominant_risk: dominantRisk,
    risk_breakdown: riskBreakdown,
    risk_level: riskLevel,
    safest_route_reason: safestRouteReason,
    avoid_route_reason: avoidRouteReason,
    route_recommendation_text: routeRecommendationText,
    ai_summary: routeRecommendationText,
  };
}

export async function fetchSafeRoute(source, destination) {
  // If `source` is an object containing `sourceCoords`, use coordinates directly.
  // This avoids re-geocoding GPS-derived addresses and prevents drift.
  let start;
  if (source && typeof source === 'object' && source.sourceCoords && Number.isFinite(source.sourceCoords.lat) && Number.isFinite(source.sourceCoords.lng)) {
    start = { lat: Number(source.sourceCoords.lat), lng: Number(source.sourceCoords.lng) };
    console.log('[ROUTING] raw GPS coords:', start, 'reverseAddress:', source.sourceAddress || null);
  } else {
    start = await geocodePlace(source);
  }

  // If `destination` is an object with coordinates, use them directly
  let end;
  if (destination && typeof destination === 'object' && destination.destCoords && Number.isFinite(destination.destCoords.lat) && Number.isFinite(destination.destCoords.lng)) {
    end = { lat: Number(destination.destCoords.lat), lng: Number(destination.destCoords.lng) };
    console.log('[ROUTING] destination object coords:', end);
  } else if (destination && typeof destination === 'object' && Number.isFinite(destination.lat) && Number.isFinite(destination.lng)) {
    // Handle autocomplete location object format {lat, lng, name, address}
    end = { lat: Number(destination.lat), lng: Number(destination.lng) };
    console.log('[ROUTING] autocomplete destination coords:', end);
  } else {
    end = await geocodePlace(destination);
  }

  console.log('[ROUTING] actual coordinates used for routing start:', start, 'end:', end);
  const osrmUrl = `${OSRM_BASE}/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&alternatives=true&steps=false`;
  const response = await fetch(osrmUrl);

  if (!response.ok) {
    throw new Error('Route service unavailable');
  }

  const payload = await response.json();
  
  // Calculate safety scores for each route in parallel
  const routesWithScores = await Promise.all(
    (payload.routes || []).map(async (route, index) => {
      const distanceKm = route.distance / 1000;
      const durationMin = Math.round(route.duration / 60);
      let coordinates = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      
      // Ensure route has enough points for display
      if (coordinates.length < 3) {
        // For short routes, add intermediate points
        const start = coordinates[0];
        const end = coordinates[coordinates.length - 1];
        const midLat = (start[0] + end[0]) / 2;
        const midLng = (start[1] + end[1]) / 2;
        coordinates = [start, [midLat, midLng], end];
      }

      // Call AI prediction and attach full metadata
      const prediction = await calculateRoutePrediction(coordinates, { distanceKm, durationMin, index });

      // Categorize route and color
      let name, category;
      const score = prediction.safety_score ?? 50;
      if (score >= 70) {
        category = 'safe';
        name = index === 0 ? 'Safe Route' : `Safe Route ${index + 1}`;
      } else if (score >= 40) {
        category = 'caution';
        name = index === 0 ? 'Balanced Route' : `Balanced Route ${index + 1}`;
      } else {
        category = 'danger';
        name = `Risky Route ${index + 1}`;
      }

      return {
        id: `route-${index + 1}`,
        name,
        safetyScore: score,
        distance: `${distanceKm.toFixed(1)} km`,
        estimatedTime: `${durationMin} min`,
        color: category,
        routeType: index === 0 ? 'Primary' : category === 'safe' ? 'Safest Candidate' : category === 'caution' ? 'Balanced' : 'High Risk',
        coordinates,
        prediction,
      };
    })
  );

  const safestRoute = [...routesWithScores].sort((a, b) => b.safetyScore - a.safetyScore)[0];
  const fastestRoute = [...routesWithScores].sort((a, b) => Number.parseFloat(a.estimatedTime) - Number.parseFloat(b.estimatedTime))[0];

  console.log('[ROUTES] Safety analysis complete:', {
    totalRoutes: routesWithScores.length,
    safestRouteId: safestRoute?.id,
    safestScore: safestRoute?.safetyScore,
    fastestRouteId: fastestRoute?.id,
  });

  // Sort by safety score descending FIRST
  const sortedByScore = [...routesWithScores].sort((a, b) => b.safetyScore - a.safetyScore);

  const finalRoutes = sortedByScore.map((route, index) => {
    const isSafest = route.id === safestRoute?.id;
    const isFastest = route.id === fastestRoute?.id;
    
    return {
      ...route,
      isRecommended: index === 0,
      isSafestRoute: isSafest,
      isFastestRoute: isFastest,
      smartBadges: buildSmartBadges(route, fastestRoute?.id, safestRoute?.id),
      routeType: isSafest
        ? '🛡 Safest Route'
        : isFastest
          ? '⚡ Fastest Route'
          : route.color === 'safe'
            ? '✅ Safe Route'
            : route.color === 'caution'
              ? '⚠️ Balanced Route'
              : '❌ High Risk Route',
    };
  });

  console.log('[ROUTES] Final routes with badges:', finalRoutes.map(r => ({
    id: r.id,
    name: r.name,
    score: r.safetyScore,
    isSafest: r.isSafestRoute,
    type: r.routeType,
  })));

  return {
    source: start,
    destination: end,
    routes: finalRoutes,
    safestRouteId: safestRoute?.id,
    fastestRouteId: fastestRoute?.id,
  };
}
