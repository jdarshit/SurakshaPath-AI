import { useState } from 'react';
import { fetchSafeRoute } from '../services/routing';

export function useSafeRoute() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const findRoute = async (source, destination) => {
    setLoading(true);
    setError('');

    try {
      const result = await fetchSafeRoute(source, destination);
      setData(result);
      return result;
    } catch (err) {
      setError(err?.message || 'Unable to load routes');
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, data, findRoute, setData };
}