import api from '../api/client';

const TOKEN_KEY = 'sp_token';
const USER_KEY = 'sp_user';

export async function sendOtp(payload) {
  const response = await api.post('/auth/send-otp', payload);
  return response.data;
}

export async function verifyOtp(payload) {
  const response = await api.post('/auth/verify-otp', payload);
  return response.data;
}

export async function login(payload) {
  const response = await api.post('/auth/login', payload);
  return response.data;
}

export async function getCurrentUser() {
  const response = await api.get('/auth/profile');
  return response.data;
}

export async function updateGuardian(payload) {
  const response = await api.put('/auth/guardian', payload);
  return response.data;
}

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
