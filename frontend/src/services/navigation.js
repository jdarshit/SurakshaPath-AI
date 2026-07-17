export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function calculateHeading(start, end) {
  const dy = end[0] - start[0];
  const dx = end[1] - start[1];
  const angle = (Math.atan2(dx, dy) * 180) / Math.PI;
  return (angle + 360) % 360;
}

export function formatDistance(distanceKm) {
  return `${Math.max(0, Number(distanceKm) || 0).toFixed(1)} km`;
}

export function formatEta(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const remaining = total % 60;
  return `${hours}h ${remaining}m`;
}

export function getZoneLabel(safetyScore = 50) {
  if (safetyScore >= 70) return 'Safe zone';
  if (safetyScore >= 40) return 'Medium-risk zone';
  return 'Unsafe zone';
}

export function deriveNavigationAlert({ route, progressPercent = 0, incidentsDelta = 0 }) {
  const score = Number(route?.safetyScore || route?.prediction?.safety_score || 50);
  const breakdown = route?.prediction?.risk_breakdown || {};
  const crimeRisk = Number(breakdown.crime_risk ?? 50);
  const lighting = Number(breakdown.lighting_quality ?? 50);
  const cctv = Number(breakdown.cctv_coverage ?? 50);
  const police = Number(breakdown.police_accessibility ?? 50);
  const routeRisk = route?.prediction?.risk_level || (score >= 70 ? 'low' : score >= 40 ? 'moderate' : 'high');

  if (progressPercent >= 92) {
    return {
      key: 'arrival',
      type: 'success',
      text: 'Destination is very close. Prepare for arrival.',
      timeline: 'Approaching destination',
      zoneSafety: 'Arrival corridor',
      shouldReroute: false,
    };
  }

  if (incidentsDelta > 0) {
    return {
      key: 'new-incident',
      type: 'danger',
      text: 'AI Alert: A new incident was reported near this corridor.',
      timeline: 'New incident detected',
      zoneSafety: 'Dynamic risk increase',
      shouldReroute: true,
    };
  }

  if (routeRisk === 'high' || crimeRisk >= 75) {
    return {
      key: 'unsafe-ahead',
      type: 'danger',
      text: '🚨 Unsafe area ahead. Recalculating a safer route.',
      timeline: 'Entered unsafe zone',
      zoneSafety: 'High risk',
      shouldReroute: true,
    };
  }

  if (progressPercent >= 25 && progressPercent < 70 && (crimeRisk >= 55 || score < 70)) {
    return {
      key: 'medium-risk',
      type: 'warning',
      text: '⚠ Entering medium-risk zone.',
      timeline: 'Entered medium-risk zone',
      zoneSafety: 'Medium risk',
      shouldReroute: false,
    };
  }

  if (lighting >= 65 || cctv >= 65) {
    return {
      key: 'well-lit',
      type: 'success',
      text: '🛡 Well-lit route detected.',
      timeline: 'Better lighting detected',
      zoneSafety: 'Well lit',
      shouldReroute: false,
    };
  }

  if (police >= 65) {
    return {
      key: 'police-nearby',
      type: 'info',
      text: '📍 Police station nearby.',
      timeline: 'Police support nearby',
      zoneSafety: 'Police support close',
      shouldReroute: false,
    };
  }

  return {
    key: 'on-track',
    type: 'info',
    text: 'AI Alert: Route is currently on track.',
    timeline: 'Moving along selected route',
    zoneSafety: getZoneLabel(score),
    shouldReroute: false,
  };
}

export function buildTripSummary(route, alerts = [], startedAt = null) {
  const startTime = startedAt ? new Date(startedAt) : null;
  const elapsedMinutes = startTime ? Math.max(1, Math.round((Date.now() - startTime.getTime()) / 60000)) : null;

  return {
    routeName: route?.name || 'Selected route',
    safetyScore: Math.round(route?.safetyScore || route?.prediction?.safety_score || 0),
    riskLevel: route?.prediction?.risk_level || getZoneLabel(route?.safetyScore || 50),
    alertsCount: alerts.length,
    etaMinutes: elapsedMinutes,
    routeType: route?.routeType || 'Balanced',
  };
}

export function buildSmartAlerts({ route, previousRoute, incidentsDelta = 0, progressPercent = 0, etaRemaining = null, previousEta = null, settings = {} }) {
  const alerts = [];
  const currentScore = Math.round(route?.safetyScore || route?.prediction?.safety_score || 50);
  const previousScore = Math.round(previousRoute?.safetyScore || previousRoute?.prediction?.safety_score || currentScore);
  const scoreDelta = previousScore - currentScore;
  const alertSensitivity = settings.alertSensitivity || 'balanced';
  const voiceAlerts = Boolean(settings.voiceAlerts);

  const shouldEscalate = (level) => {
    if (alertSensitivity === 'high') return true;
    if (alertSensitivity === 'low') return level === 'danger';
    return level !== 'info';
  };

  if (scoreDelta >= 10) {
    alerts.push({
      type: 'warning',
      title: 'AI Alert',
      text: `Route safety dropped from ${previousScore} to ${currentScore}.`,
      meta: 'Safety score changed',
      voiceText: 'Warning. Route safety has dropped significantly.',
      speak: voiceAlerts && shouldEscalate('warning'),
    });
  }

  if (incidentsDelta > 0) {
    alerts.push({
      type: 'danger',
      title: 'AI Alert',
      text: 'Crime intensity increasing ahead.',
      meta: `${incidentsDelta} new incident${incidentsDelta > 1 ? 's' : ''} nearby`,
      voiceText: 'Warning. Unsafe area ahead.',
      speak: voiceAlerts && shouldEscalate('danger'),
    });
  }

  const breakdown = route?.prediction?.risk_breakdown || {};
  if (Number(breakdown.police_accessibility ?? 50) >= 65) {
    alerts.push({
      type: 'info',
      title: 'AI Alert',
      text: 'Police station nearby.',
      meta: 'Support point detected',
      voiceText: 'Police station nearby.',
      speak: voiceAlerts && shouldEscalate('info'),
    });
  }

  if (Number(breakdown.lighting_quality ?? 50) >= 65 && progressPercent > 10) {
    alerts.push({
      type: 'success',
      title: 'AI Alert',
      text: 'Safer road detected ahead.',
      meta: 'Lighting and coverage improving',
      voiceText: 'Safer road detected ahead.',
      speak: voiceAlerts && shouldEscalate('success'),
    });
  }

  if (Number(route?.prediction?.risk_level === 'high' || currentScore < 40)) {
    alerts.push({
      type: 'danger',
      title: 'AI Alert',
      text: 'Unsafe area ahead.',
      meta: 'High risk route segment',
      voiceText: 'Warning. Unsafe area ahead.',
      speak: voiceAlerts && shouldEscalate('danger'),
    });
  }

  if (settings.autoReroute && currentScore < 50) {
    alerts.push({
      type: 'reroute',
      title: 'AI Alert',
      text: 'Safer reroute available.',
      meta: 'Auto reroute triggered',
      voiceText: 'Safer reroute available.',
      speak: voiceAlerts && shouldEscalate('warning'),
    });
  }

  if (etaRemaining !== null && previousEta !== null && Number(previousEta) - Number(etaRemaining) > 8) {
    alerts.push({
      type: 'warning',
      title: 'AI Alert',
      text: `ETA updated to ${Math.max(0, Math.round(etaRemaining))} minutes.`,
      meta: 'Travel time changed',
      voiceText: 'Estimated arrival time has changed.',
      speak: voiceAlerts && shouldEscalate('warning'),
    });
  }

  if (progressPercent >= 92) {
    alerts.push({
      type: 'success',
      title: 'AI Alert',
      text: 'Destination is very close.',
      meta: 'Arrival detected',
      voiceText: 'Destination is very close.',
      speak: voiceAlerts && shouldEscalate('success'),
    });
  }

  return alerts;
}
