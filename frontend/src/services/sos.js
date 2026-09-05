import api from '../api/client';

export async function triggerSosAlert(payload) {
  const response = await api.post('/sos/trigger', payload);
  return response.data;
}

export async function getActiveSosAlerts() {
  const response = await api.get('/sos/active');
  return response.data;
}

export async function resolveSosAlert(alertId) {
  const response = await api.patch(`/sos/${alertId}/resolve`);
  return response.data;
}
