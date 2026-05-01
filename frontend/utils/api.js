// frontend/utils/api.js
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
async function request(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers
    };
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        return response.json();
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
}

// Hospitals
export const getHospitals = async (lat, lng, emergency = false) => {
    let url = '/hospitals';
    const params = new URLSearchParams();
    if (lat && lng) { params.append('lat', lat); params.append('lng', lng); }
    if (emergency) params.append('emergency', 'true');
    if (params.toString()) url += `?${params.toString()}`;
    return request(url);
};

export const getHospital = (id) => request(`/hospitals/${id}`);
export const updateHospitalAvailability = (id, data) => request(`/hospitals/${id}/availability`, { method: 'PUT', body: JSON.stringify(data) });

// Messages (Chat) – FIXED: uses correct endpoint and body
export const sendMessage = (senderId, hospitalId, message, receiverId = null) => 
    request('/messages/send', { 
        method: 'POST', 
        body: JSON.stringify({ 
            sender_id: senderId, 
            hospital_id: hospitalId, 
            message, 
            receiver_id: receiverId 
        }) 
    });

export const getMessages = (hospitalId) => request(`/messages/conversation/${hospitalId}`);

// Service Requests (ambulance)
export const createRequest = (data) => request('/requests', { method: 'POST', body: JSON.stringify(data) });

// Admin endpoints (super admin)
export const adminGetHospitals = () => request('/admin/hospitals');
export const adminApproveHospital = (id) => request(`/admin/hospitals/${id}/approve`, { method: 'PUT' });
export const adminAddHospital = (data) => request('/admin/hospitals', { method: 'POST', body: JSON.stringify(data) });
