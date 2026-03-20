// BidKarts Mobile App - API Service
// Connects to BidKarts backend

import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Production API URL - Update this to your deployed Cloudflare URL
export const API_BASE_URL = 'https://your-app.pages.dev/api';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - attach auth token
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('bk_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('bk_token');
      await AsyncStorage.removeItem('bk_user');
      // Navigate to login - handled in app
    }
    return Promise.reject(error);
  }
);

export default api;

// ── Auth API ─────────────────────────────────────────────────────────────────
export const AuthAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (payload: any) =>
    api.post('/auth/register', payload),
  googleAuth: (token: string) =>
    api.post('/auth/google', { token }),
  resetPassword: (email: string) =>
    api.post('/users/forgot-password', { email }),
};

// ── Projects API ──────────────────────────────────────────────────────────────
export const ProjectsAPI = {
  list: (params?: any) =>
    api.get('/projects', { params }),
  get: (id: number) =>
    api.get(`/projects/${id}`),
  myList: () =>
    api.get('/projects/my/list'),
  create: (data: any) =>
    api.post('/projects', data),
  update: (id: number, data: any) =>
    api.patch(`/projects/${id}`, data),
  uploadDocument: (projectId: number, data: any) =>
    api.post(`/projects/${projectId}/documents`, data),
  deleteDocument: (projectId: number, docId: number) =>
    api.delete(`/projects/${projectId}/documents/${docId}`),
  selectVendor: (projectId: number, bidId: number, vendorId: number) =>
    api.post(`/projects/${projectId}/select-vendor`, { bid_id: bidId, vendor_id: vendorId }),
  complete: (projectId: number, note?: string) =>
    api.post(`/projects/${projectId}/complete`, { completion_note: note }),
  live: () =>
    api.get('/projects/live'),
};

// ── Bids API ──────────────────────────────────────────────────────────────────
export const BidsAPI = {
  submit: (data: any) =>
    api.post('/bids', data),
  myBids: () =>
    api.get('/bids/vendor/my'),
  projectBids: (projectId: number) =>
    api.get(`/bids/project/${projectId}`),
  update: (bidId: number, data: any) =>
    api.patch(`/bids/${bidId}`, data),
  withdraw: (bidId: number) =>
    api.delete(`/bids/${bidId}`),
  projectDocuments: (projectId: number) =>
    api.get(`/bids/project/${projectId}/documents`),
};

// ── Consultations / Experts API ───────────────────────────────────────────────
export const ConsultationsAPI = {
  experts: (params?: any) =>
    api.get('/consultations/experts', { params }),
  expertDetail: (id: number) =>
    api.get(`/consultations/experts/${id}`),
  list: (params?: any) =>
    api.get('/consultations', { params }),
  book: (data: any) =>
    api.post('/consultations', data),
  accept: (id: number, data: any) =>
    api.patch(`/consultations/${id}/accept`, data),
  reject: (id: number, reason: string) =>
    api.patch(`/consultations/${id}/reject`, { reason }),
  complete: (id: number, data: any) =>
    api.patch(`/consultations/${id}/complete`, data),
  rate: (id: number, rating: number, review: string) =>
    api.patch(`/consultations/${id}/rate`, { rating, review }),
  earnings: () =>
    api.get('/consultations/earnings'),
  slots: (expertId: number) =>
    api.get(`/consultations/slots/${expertId}`),
  addSlot: (data: any) =>
    api.post('/consultations/slots', data),
};

// ── Inspections API ───────────────────────────────────────────────────────────
export const InspectionsAPI = {
  my: () =>
    api.get('/inspections/my'),
  request: (projectId: number) =>
    api.post('/inspections', { project_id: projectId }),
  submitReport: (id: number, data: any) =>
    api.patch(`/inspections/${id}/report`, data),
};

// ── Payments API ──────────────────────────────────────────────────────────────
export const PaymentsAPI = {
  my: () =>
    api.get('/payments/my'),
  initiate: (data: any) =>
    api.post('/payments/initiate', data),
  verify: (data: any) =>
    api.post('/payments/verify', data),
  escrow: (projectId: number) =>
    api.get(`/payments/escrow/${projectId}`),
  releaseEscrow: (data: any) =>
    api.post('/payments/escrow/release', data),
  gstInvoice: (paymentId: number) =>
    api.get(`/payments/gst-invoice/${paymentId}`),
  stats: () =>
    api.get('/payments/stats'),
};

// ── Messages API ──────────────────────────────────────────────────────────────
export const MessagesAPI = {
  conversations: () =>
    api.get('/messages/conversations'),
  messages: (convId: number) =>
    api.get(`/messages/${convId}`),
  start: (projectId: number, vendorId: number) =>
    api.post('/messages/start', { project_id: projectId, vendor_id: vendorId }),
  send: (convId: number, content: string, attachment?: any) =>
    api.post(`/messages/${convId}/send`, { content, ...attachment }),
  markRead: (convId: number) =>
    api.post(`/messages/${convId}/read`),
  unreadCount: () =>
    api.get('/messages/unread/count'),
};

// ── Users API ─────────────────────────────────────────────────────────────────
export const UsersAPI = {
  me: () =>
    api.get('/users/me'),
  update: (data: any) =>
    api.patch('/users/profile', data),
  notifications: () =>
    api.get('/users/notifications'),
  markNotificationsRead: () =>
    api.patch('/users/notifications/read'),
  vendors: (params?: any) =>
    api.get('/users/vendors', { params }),
  vendorDetail: (id: number) =>
    api.get(`/users/vendors/${id}`),
};

// ── Disputes API ──────────────────────────────────────────────────────────────
export const DisputesAPI = {
  list: () =>
    api.get('/disputes'),
  create: (data: any) =>
    api.post('/disputes', data),
  resolve: (id: number, data: any) =>
    api.patch(`/disputes/${id}/resolve`, data),
};

// ── AI Tools API ──────────────────────────────────────────────────────────────
export const AIToolsAPI = {
  estimate: (serviceType: string, area: number, location: string) =>
    api.get('/ai/estimate', { params: { service_type: serviceType, area, location } }),
  recommend: (projectId: number) =>
    api.get('/ai/recommend', { params: { project_id: projectId } }),
  specGenerator: (serviceType: string, area?: number) =>
    api.get('/ai/spec-generator', { params: { service_type: serviceType, area } }),
};
