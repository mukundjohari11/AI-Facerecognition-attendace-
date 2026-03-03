import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
    baseURL: API_BASE,
    timeout: 60000,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Auth
export const authAPI = {
    register: (data) => api.post('/auth/register', data),
    login: (data) => api.post('/auth/login', data),
    me: () => api.get('/auth/me'),
};

// Sections
export const sectionAPI = {
    list: (params) => api.get('/sections', { params }),
    get: (id) => api.get(`/sections/${id}`),
    create: (data) => api.post('/sections', data),
    update: (id, data) => api.put(`/sections/${id}`, data),
    delete: (id) => api.delete(`/sections/${id}`),
};

//  Students 
export const studentAPI = {
    list: (params) => api.get('/students', { params }),
    get: (id) => api.get(`/students/${id}`),
    create: (data) => api.post('/students', data),
    bulkCreate: (students) => api.post('/students/bulk', { students }),
    update: (id, data) => api.put(`/students/${id}`, data),
    delete: (id) => api.delete(`/students/${id}`),
    enrollFace: (id, formData) =>
        api.post(`/students/${id}/enroll-face`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000,
        }),
};

// Attendance 
export const attendanceAPI = {
    capture: (formData) =>
        api.post('/attendance/capture', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60000,
        }),
    list: (params) => api.get('/attendance', { params }),
    get: (id) => api.get(`/attendance/${id}`),
    approve: (id, data) => api.patch(`/attendance/${id}/approve`, data),
    reportSummary: (params) => api.get('/attendance/reports/summary', { params }),
};

export default api;
