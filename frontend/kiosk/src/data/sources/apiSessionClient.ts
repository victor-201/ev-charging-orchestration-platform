import axios from 'axios';

const SESSION_API_BASE = import.meta.env.VITE_SESSION_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

export const apiSessionClient = axios.create({
  baseURL: SESSION_API_BASE,
  timeout: 60_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiSessionClient.interceptors.request.use((config) => {
  if (config.headers) {
    config.headers['X-Kiosk-Key'] = import.meta.env.VITE_KIOSK_API_KEY;
  }
  return config;
});
