import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
});

// Auto-attach token
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('ekilit_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Login
export async function login(email, password) {
  const { data } = await api.post('/auth/login', {
    email,
    password,
    device_type: 'mobile',
    device_info: 'E-Kilit Mobile App'
  });

  await AsyncStorage.setItem('ekilit_token', data.tokens.access_token);
  await AsyncStorage.setItem('ekilit_refresh', data.tokens.refresh_token);
  await AsyncStorage.setItem('ekilit_user', JSON.stringify(data.user));

  return data;
}

// QR ile kilit açma
export async function unlockWithQr(boardCode, qrToken) {
  const { data } = await api.post('/unlock/qr', {
    board_code: boardCode,
    qr_token: qrToken
  });
  return data;
}

// Auth kontrolü
export async function checkAuth() {
  const { data } = await api.get('/auth/me');
  return data;
}

export default api;
