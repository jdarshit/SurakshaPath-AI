import axios from 'axios';

const configuredBaseUrl = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL;
const browserHost = typeof window !== 'undefined' && window.location.hostname
  ? window.location.hostname
  : '127.0.0.1';
const browserProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:'
  ? 'https:'
  : 'http:';
const isLocalHost = browserHost === 'localhost' || browserHost === '127.0.0.1';
const configuredIsLocal = configuredBaseUrl?.includes('localhost:8000') || configuredBaseUrl?.includes('127.0.0.1:8000');
const fallbackBaseUrl = isLocalHost
  ? `${browserProtocol}//${browserHost}:8000`
  : 'https://surakshapath-api.onrender.com';
const BASE_URL = ((configuredBaseUrl && (!configuredIsLocal || isLocalHost)) || fallbackBaseUrl).replace(/\/$/, '');

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Don't force Content-Type for FormData - let browser handle it
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  
  return config;
});

// Handle 401 errors (unauthorized)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth state
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Redirect to login
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  }
);

export default api;