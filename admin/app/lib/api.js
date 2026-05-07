import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - add token
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const store = JSON.parse(localStorage.getItem('e-kilit-auth') || '{}');
      const token = store?.state?.token;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED' && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const store = JSON.parse(localStorage.getItem('e-kilit-auth') || '{}');
        const refreshToken = store?.state?.refreshToken;

        if (refreshToken) {
          const { data } = await axios.post(`${API_BASE}/auth/refresh`, {
            refresh_token: refreshToken
          });

          // Update store
          store.state.token = data.access_token;
          localStorage.setItem('e-kilit-auth', JSON.stringify(store));

          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Clear auth and redirect to login
        localStorage.removeItem('e-kilit-auth');
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;

// =========== API FUNCTIONS ===========

// Auth
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),
};

// Schools
export const schoolsAPI = {
  list: (params) => api.get('/schools', { params }),
  create: (data) => api.post('/schools', data),
  get: (id) => api.get(`/schools/${id}`),
  update: (id, data) => api.put(`/schools/${id}`, data),
  delete: (id) => api.delete(`/schools/${id}`),
  stats: (id) => api.get(`/schools/${id}/stats`),
};

// Users
export const usersAPI = {
  list: (params) => api.get('/users', { params }),
  create: (data) => api.post('/users', data),
  get: (id) => api.get(`/users/${id}`),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

// Boards
export const boardsAPI = {
  list: (params) => api.get('/boards', { params }),
  get: (id) => api.get(`/boards/${id}`),
  update: (id, data) => api.put(`/boards/${id}`, data),
  delete: (id) => api.delete(`/boards/${id}`),
  liveScreenshots: () => api.get('/boards/screenshots/live'),
  screenshots: (id, params) => api.get(`/boards/${id}/screenshots`, { params }),
};

// Unlock
export const unlockAPI = {
  remote: (data) => api.post('/unlock/remote', data),
  lock: (data) => api.post('/unlock/lock', data),
};

// USB Keys
export const usbKeysAPI = {
  list: (params) => api.get('/usb-keys', { params }),
  create: (data) => api.post('/usb-keys', data),
  update: (id, data) => api.put(`/usb-keys/${id}`, data),
  revoke: (id) => api.delete(`/usb-keys/${id}/revoke`),
  delete: (id) => api.post(`/usb-keys/delete-key/${id}`),
};

// Reports
export const reportsAPI = {
  unlockLogs: (params) => api.get('/reports/unlock-logs', { params }),
  boardUsage: (params) => api.get('/reports/board-usage', { params }),
  teacherActivity: (params) => api.get('/reports/teacher-activity', { params }),
  export: (params) => api.get('/reports/export', { params, responseType: 'blob' }),
};

// Files
export const filesAPI = {
  list: (params) => api.get('/files', { params }),
  upload: (formData) => api.post('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  }),
  download: (id) => api.get(`/files/${id}/download`, { responseType: 'blob' }),
  delete: (id) => api.delete(`/files/${id}`),
  assign: (id, boardIds) => api.post(`/files/${id}/assign`, { board_ids: boardIds }),
};

// Announcements
export const announcementsAPI = {
  list: (params) => api.get('/announcements', { params }),
  create: (data) => api.post('/announcements', data),
  update: (id, data) => api.put(`/announcements/${id}`, data),
  delete: (id) => api.delete(`/announcements/${id}`),
};

// Site Rules
export const siteRulesAPI = {
  list: (params) => api.get('/site-rules', { params }),
  create: (data) => api.post('/site-rules', data),
  delete: (id) => api.delete(`/site-rules/${id}`),
};

// Licenses
export const licensesAPI = {
  list: (params) => api.get('/licenses', { params }),
  create: (data) => api.post('/licenses', data),
  update: (id, data) => api.put(`/licenses/${id}`, data),
  delete: (id) => api.delete(`/licenses/${id}`),
  check: () => api.get('/licenses/check'),
  createTrial: (schoolId) => api.post('/licenses/create-trial', { school_id: schoolId }),
};
