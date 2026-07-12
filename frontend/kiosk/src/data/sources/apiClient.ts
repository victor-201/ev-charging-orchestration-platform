import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 60_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

function generateIdempotencyKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

function shouldRetry(error: unknown, attempt: number): boolean {
  if (attempt >= MAX_RETRIES) return false;
  if (!error || !axios.isAxiosError(error)) return false;
  if (!error.config) return false;

  const status = error.response?.status;
  if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') return true;
  if (status === 429) return true;
  if (status && status >= 500 && status < 600) return true;

  return false;
}

function getRetryDelay(attempt: number): number {
  const jitter = Math.random() * 500;
  return Math.min(BASE_DELAY * Math.pow(2, attempt) + jitter, 15_000);
}

// Set dynamic headers on every request
apiClient.interceptors.request.use((config) => {
  if (config.headers) {
    config.headers['X-Kiosk-Key'] = import.meta.env.VITE_KIOSK_API_KEY;
  }

  const method = config.method?.toUpperCase();
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    config.headers['Idempotency-Key'] = generateIdempotencyKey();
  }

  return config;
});

// Response interceptor: exponential backoff retry for transient infrastructure errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    originalRequest._retryCount = (originalRequest._retryCount || 0);

    if (
      shouldRetry(error, originalRequest._retryCount) &&
      originalRequest._retryCount < MAX_RETRIES
    ) {
      originalRequest._retryCount += 1;
      const delay = getRetryDelay(originalRequest._retryCount - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return apiClient(originalRequest);
    }

    return Promise.reject(error);
  }
);
