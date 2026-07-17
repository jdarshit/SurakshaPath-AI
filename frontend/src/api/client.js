import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000',
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sp_token');
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
      localStorage.removeItem('sp_token');
      localStorage.removeItem('sp_user');
      // Redirect to login
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  }
);

export default api;