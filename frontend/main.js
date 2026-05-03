import './style.css';
import { initMap, addMarkers, showRoute, showUserLocation } from './components/MapComponent';
import { initSearch, performSmartSearch } from './components/SearchComponent';
import { initAuth, getUser, logout } from './utils/auth';
import { getHospitals, sendMessage, getMessages, createRequest } from './utils/api';
import { initSocket, sendChatMessage, joinChatRoom, onNewMessage } from './utils/socket';

let currentHospitals = [];
let mapInstance = null;
let currentUser = null;
let activeChatHospitalId = null;
let activeChatHospitalName = '';
let socket = null;
let emergencyModeActive = false;
let searchInitialised = false;

const API_BASE = 'https://bel-care.onrender.com/api';

async function fetchJSON(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${url}`, { headers, ...options });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function loadHospitals(lat = null, lng = null, filterService = '') {
    const resultsDiv = document.getElementById('resultsList');
    resultsDiv.innerHTML = '<div class="loading">Loading hospitals...</div>';
    try {
        let hospitals = await getHospitals(lat, lng, emergencyModeActive);
        if (filterService && filterService.trim() !== '') {
            const term = filterService.toLowerCase();
            hospitals = hospitals.filter(h =>
                (h.services || []).some(s => s.toLowerCase().includes(term))
            );
        }
        currentHospitals = hospitals;
        if (mapInstance) {
            addMarkers(mapInstance, hospitals, (hosp) => {
                if (!currentUser) return alert('Please login to chat');
                openChatWindow(hosp.id, hosp.name);
            });
        }
        renderHospitalList(hospitals);
        initSearchOnce(hospitals);
    } catch (error) {
        console.error(error);
        resultsDiv.innerHTML = '<div class="loading" style="color:red;">Failed to load hospitals.</div>';
    }
}

function initSearchOnce(hospitals) {
    if (searchInitialised) return;
    const searchInput = document.getElementById('smartSearch');
    if (!searchInput || !hospitals.length) return;
    performSmartSearch(hospitals, '', () => {});
    const newInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newInput, searchInput);
    initSearch(newInput, (filtered) => {
        if (filtered === '') {
            renderHospitalList(currentHospitals);
            if (mapInstance) addMarkers(mapInstance, currentHospitals, () => {});
        } else if (filtered.length) {
            renderHospitalList(filtered);
            if (mapInstance) addMarkers(mapInstance, filtered, () => {});
        } else {
            renderHospitalList([]);
        }
    });
    searchInitialised = true;
}

function renderHospitalList(hospitals) {
    const container = document.getElementById('resultsList');
    if (!container) return;
    if (!hospitals.length) {
        container.innerHTML = '<div class="loading">No hospitals found.</div>';
        return;
    }
    container.innerHTML = hospitals.map(h => `
        <div class="hospital-card" data-id="${h.id}">
            <h4>${h.emergency_ready ? '🚨 ' : '🏥 '}${escapeHtml(h.name || 'Unnamed Hospital')}</h4>
            <p style="font-size:12px;color:#666;">${escapeHtml(h.address || 'No address')}</p>
            <div class="services-badge">${(h.services || []).filter(s=>s).slice(0,3).map(s=>`<span class="service-tag">${escapeHtml(s)}</span>`).join('')}</div>
            <div>🩺 Health ${h.health_score || 'N/A'}/5 | 🛏️ ${h.bed_availability || 0} beds</div>
            ${h.distance ? `<div>📍 ${h.distance.toFixed(1)} km away</div>` : ''}
            <div class="last-updated">🕒 Services last updated: ${h.last_updated ? new Date(h.last_updated).toLocaleString() : 'Unknown'}</div>
            <div style="margin-top:8px;">
                <button class="btn-outline-sm directions-btn" data-id="${h.id}">🧭 Directions</button>
                <button class="btn-primary-sm details-btn" data-id="${h.id}">📋 View Details</button>
                <button class="btn-primary-sm chat-btn" data-id="${h.id}" data-name="${escapeHtml(h.name || 'Hospital')}" style="background:#28a745;">💬 Chat</button>
                <button class="call-btn" data-phone="${h.phone || ''}" style="background:#17a2b8; color:white; border:none; border-radius:5px; padding:5px 10px;">📞 Call</button>
                <button class="ambulance-btn" data-id="${h.id}" style="background:#dc3545; color:white; border:none; border-radius:5px; padding:5px 10px;">🚑 Ambulance</button>
                <button class="rate-btn" data-id="${h.id}" style="background:#ffc107; color:#333; border:none; border-radius:5px; padding:5px 10px;">⭐ Rate</button>
            </div>
        </div>
    `).join('');
    attachButtonEvents();
}

function attachButtonEvents() {
    document.querySelectorAll('.directions-btn').forEach(btn => btn.onclick = (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const hosp = currentHospitals.find(h => h.id === id);
        if (hosp && mapInstance) showRoute(mapInstance, hosp);
    });
    document.querySelectorAll('.details-btn').forEach(btn => btn.onclick = (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const hosp = currentHospitals.find(h => h.id === id);
        if (hosp) showHospitalDetails(hosp);
    });
    document.querySelectorAll('.chat-btn').forEach(btn => btn.onclick = (e) => {
        e.stopPropagation();
        if (!currentUser) { alert('Please login to chat'); return; }
        const id = parseInt(btn.dataset.id);
        const name = btn.dataset.name;
        openChatWindow(id, name);
    });
    document.querySelectorAll('.call-btn').forEach(btn => btn.onclick = (e) => {
        e.stopPropagation();
        const phone = btn.dataset.phone;
        if (phone && phone !== 'null' && phone !== '') window.location.href = `tel:${phone}`;
        else alert('Phone number not available');
    });
    document.querySelectorAll('.ambulance-btn').forEach(btn => btn.onclick = (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        requestAmbulance(id);
    });
    document.querySelectorAll('.rate-btn').forEach(btn => btn.onclick = (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        rateHospital(id);
    });
}

// ---------- HOSPITAL DETAILS MODAL (with service search inside) ----------
async function showHospitalDetails(hospital) {
    const existing = document.getElementById('hospitalModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'hospitalModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:600px; max-height:80vh; overflow-y:auto;">
            <span class="close">&times;</span>
            <h3>${escapeHtml(hospital.name)}</h3>
            <div id="modalRating"></div>
            <p><strong>Phone:</strong> ${hospital.phone || 'N/A'} <button class="call-modal-btn">📞 Call</button></p>
            <div style="margin:1rem 0;">
                <h4>Media Gallery</h4>
                <div id="modalMedia" style="display:flex; flex-wrap:wrap; gap:10px;"></div>
            </div>
            <div style="margin:1rem 0;">
                <h4>Services Offered</h4>
                <input type="text" id="serviceSearchModal" placeholder="🔍 Filter services..." style="width:100%; padding:0.5rem; margin-bottom:10px; border:1px solid #ccc; border-radius:20px;">
                <div id="modalServices" style="max-height:200px; overflow-y:auto;"></div>
            </div>
            <div><h4>About</h4><p>${escapeHtml(hospital.description || 'No description')}</p></div>
            <button id="modalChatBtn" style="margin-top:10px;">💬 Chat</button>
            <button id="modalAmbulanceBtn" style="margin-top:10px; background:#dc3545;">🚑 Request Ambulance</button>
            <button id="modalRateBtn" style="margin-top:10px; background:#ffc107;">⭐ Rate Hospital</button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    modal.querySelector('.close').onclick = () => modal.remove();
    modal.querySelector('.call-modal-btn')?.addEventListener('click', () => {
        if (hospital.phone) window.location.href = `tel:${hospital.phone}`;
        else alert('No phone number');
    });

    let allServices = [];
    try {
        const media = await fetchJSON(`/hospitals/${hospital.id}/media`);
        const mediaDiv = modal.querySelector('#modalMedia');
        mediaDiv.innerHTML = media.map(m => `<div style="width:150px;">${m.file_type === 'image' ? `<img src="${API_BASE.replace('/api','')}${m.file_url}" style="width:100%; border-radius:8px;">` : `<video controls src="${API_BASE.replace('/api','')}${m.file_url}" style="width:100%;"></video>`}</div>`).join('');
        if (!media.length) mediaDiv.innerHTML = '<p>No media</p>';
        
        allServices = await fetchJSON(`/hospitals/${hospital.id}/services`);
        const servicesDiv = modal.querySelector('#modalServices');
        function renderServices(filter = '') {
            const term = filter.toLowerCase();
            const filtered = allServices.filter(s => s.name.toLowerCase().includes(term));
            servicesDiv.innerHTML = filtered.map(s => `<div style="padding:5px 0; border-bottom:1px solid #eee;"><strong>${escapeHtml(s.name)}</strong> <span>${s.is_available ? 'Available' : 'Unavailable'}</span><br><small>Last updated: ${s.updated_at ? new Date(s.updated_at).toLocaleString() : 'Never'}</small></div>`).join('');
            if (!filtered.length) servicesDiv.innerHTML = '<p>No services match</p>';
        }
        renderServices('');
        const searchInputModal = modal.querySelector('#serviceSearchModal');
        searchInputModal.addEventListener('input', (e) => renderServices(e.target.value));
        
        const ratingData = await fetchJSON(`/hospitals/${hospital.id}/rating`);
        modal.querySelector('#modalRating').innerHTML = `⭐ Rating: ${ratingData.avg_rating.toFixed(1)}/5 (${ratingData.total} reviews)`;
    } catch(e) { console.error(e); }
    
    modal.querySelector('#modalChatBtn').onclick = () => { modal.remove(); openChatWindow(hospital.id, hospital.name); };
    modal.querySelector('#modalAmbulanceBtn').onclick = () => { modal.remove(); requestAmbulance(hospital.id); };
    modal.querySelector('#modalRateBtn').onclick = () => rateHospital(hospital.id);
}

// ---------- AMBULANCE REQUEST ----------
async function requestAmbulance(hospitalId, serviceId = 1) {
    if (!currentUser) { alert('Please login first'); return; }
    const patientName = prompt('Enter patient name (or your name):');
    if (!patientName) return;
    const notes = prompt('Any additional notes (e.g., condition, location):');
    try {
        const res = await fetch(`${API_BASE}/requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({
                hospital_id: hospitalId,
                service_id: serviceId,
                patient_name: patientName,
                notes: notes || ''
            })
        });
        const data = await res.json();
        if (res.ok) alert('Ambulance request sent successfully. The hospital will respond.');
        else alert('Error: ' + data.error);
    } catch(e) {
        console.error(e);
        alert('Request failed. Please try again.');
    }
}

// ---------- RATE HOSPITAL (FEEDBACK) ----------
async function rateHospital(hospitalId) {
    if (!currentUser) { alert('Please login'); return; }
    const rating = prompt('Rate this hospital (1-5 stars):');
    if (!rating || rating < 1 || rating > 5) return;
    const comment = prompt('Leave a comment (optional):');
    try {
        const res = await fetch(`${API_BASE}/hospitals/${hospitalId}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ rating: parseInt(rating), comment: comment || '' })
        });
        if (res.ok) alert('Thank you for your feedback!');
        else alert('Failed to submit feedback');
    } catch(e) { alert('Error submitting feedback'); }
}

// ---------- FLOATING CHAT ----------
const floatingChat = document.getElementById('floatingChat');
const chatMessagesDiv = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatHospitalNameSpan = document.getElementById('chatHospitalName');
const minimizeBtn = document.getElementById('minimizeChatBtn');
const closeChatBtn = document.getElementById('closeChatBtn');
const sendMsgBtn = document.getElementById('sendMsgBtn');
let isChatMinimized = false;

function openChatWindow(hospitalId, hospitalName) {
    if (!currentUser) {
        alert('Please login to chat');
        return;
    }
    activeChatHospitalId = hospitalId;
    activeChatHospitalName = hospitalName;
    chatHospitalNameSpan.innerText = hospitalName;
    floatingChat.classList.remove('hidden');
    if (isChatMinimized) {
        floatingChat.classList.remove('minimized');
        isChatMinimized = false;
    }
    loadChatMessages();
    if (socket) joinChatRoom(hospitalId, currentUser.id, 'user');
}

async function loadChatMessages() {
    if (!activeChatHospitalId) return;
    chatMessagesDiv.innerHTML = '<div class="loading">Loading messages...</div>';
    try {
        const messages = await getMessages(activeChatHospitalId);
        renderChatMessages(messages);
    } catch(e) {
        console.error(e);
        chatMessagesDiv.innerHTML = '<div class="loading">Error loading messages</div>';
    }
}

function renderChatMessages(messages) {
    if (!messages || messages.length === 0) {
        chatMessagesDiv.innerHTML = '<div class="loading">No messages yet. Start a conversation!</div>';
        return;
    }
    chatMessagesDiv.innerHTML = messages.map(m => `
        <div class="message ${m.sender_id === currentUser?.id ? 'sent' : 'received'}">
            <strong>${escapeHtml(m.sender_name || (m.sender_id === currentUser?.id ? 'You' : 'Hospital'))}</strong>
            <p>${escapeHtml(m.message)}</p>
            <small>${new Date(m.created_at).toLocaleTimeString()}</small>
        </div>
    `).join('');
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

async function sendChatMessageToHospital() {
    const text = chatInput.value.trim();
    if (!text || !activeChatHospitalId || !currentUser) {
        alert('Cannot send empty message');
        return;
    }
    try {
        await sendMessage(currentUser.id, activeChatHospitalId, text, null);
        if (socket) sendChatMessage(text, activeChatHospitalId, null, currentUser.id, currentUser.name);
        chatInput.value = '';
        const messages = await getMessages(activeChatHospitalId);
        renderChatMessages(messages);
    } catch(e) {
        console.error(e);
        alert('Failed to send message: ' + (e.message || 'Unknown error'));
    }
}

minimizeBtn?.addEventListener('click', () => {
    floatingChat.classList.add('minimized');
    isChatMinimized = true;
});
closeChatBtn?.addEventListener('click', () => {
    floatingChat.classList.add('hidden');
    activeChatHospitalId = null;
});
sendMsgBtn?.addEventListener('click', sendChatMessageToHospital);
chatInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessageToHospital(); });

// Dragging
let isDragging = false;
let dragOffsetX, dragOffsetY;
const chatHeader = document.getElementById('chatHeader');
if (chatHeader) {
    chatHeader.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        dragOffsetX = e.clientX - floatingChat.getBoundingClientRect().left;
        dragOffsetY = e.clientY - floatingChat.getBoundingClientRect().top;
        floatingChat.style.position = 'fixed';
        floatingChat.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        let left = e.clientX - dragOffsetX;
        let top = e.clientY - dragOffsetY;
        left = Math.min(Math.max(left, 0), window.innerWidth - floatingChat.offsetWidth);
        top = Math.min(Math.max(top, 0), window.innerHeight - floatingChat.offsetHeight);
        floatingChat.style.left = left + 'px';
        floatingChat.style.top = top + 'px';
        floatingChat.style.right = 'auto';
        floatingChat.style.bottom = 'auto';
    });
    window.addEventListener('mouseup', () => {
        isDragging = false;
        floatingChat.style.cursor = '';
    });
}

// ---------- UI UPDATE ----------
function updateUIForUser(user) {
    if (user) {
        document.getElementById('authButtons').style.display = 'none';
        document.getElementById('userInfo').style.display = 'flex';
        const displayName = user.name || user.email || 'User';
        document.getElementById('userName').innerHTML = `<i class="fas fa-user"></i> ${escapeHtml(displayName)}`;
        document.getElementById('logoutBtn').onclick = () => { logout(); location.reload(); };
        if (socket) socket.disconnect();
        socket = initSocket(user.id);
        if (socket) {
            socket.on('connect', () => console.log('Socket connected'));
            onNewMessage((data) => {
                if (data.hospital_id === activeChatHospitalId) {
                    getMessages(activeChatHospitalId).then(renderChatMessages);
                }
            });
        }
    } else {
        document.getElementById('authButtons').style.display = 'flex';
        document.getElementById('userInfo').style.display = 'none';
        if (socket) socket.disconnect();
        socket = null;
    }
}

// ---------- INIT ----------
async function init() {
    const storedUser = getUser();
    if (storedUser && storedUser.role === 'user') {
        currentUser = storedUser;
        updateUIForUser(currentUser);
    }

    mapInstance = await initMap('map');
    if (!mapInstance) return;
    showUserLocation(mapInstance, (lat, lng) => loadHospitals(lat, lng));
    loadHospitals();

    initAuth(() => {
        currentUser = getUser();
        updateUIForUser(currentUser);
        loadHospitals();
    });

    document.getElementById('emergencyModeBtn').onclick = () => {
        emergencyModeActive = !emergencyModeActive;
        document.getElementById('emergencyModeBtn').style.background = emergencyModeActive ? '#ff4444' : '#dc3545';
        loadHospitals();
    };

    window.addEventListener('chatHospital', e => {
        const hosp = currentHospitals.find(h => h.id === e.detail.id);
        if (hosp) openChatWindow(hosp.id, hosp.name);
    });
    window.addEventListener('directionsHospital', e => {
        const hosp = currentHospitals.find(h => h.id === e.detail.id);
        if (hosp && mapInstance) showRoute(mapInstance, hosp);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
}

document.addEventListener('DOMContentLoaded', init);