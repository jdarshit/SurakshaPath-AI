import api from '../api/client';

export async function testPrediction() {
  const { data } = await api.get('/test/predict');
  return data;
}