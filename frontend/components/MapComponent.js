import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet-routing-machine';

// Fix default icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

let map = null;
let markersCluster = null;
let routingControl = null;
let userLocationMarker = null;
let userLocationCircle = null;
let currentSpeechUtterance = null;

export async function initMap(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return null;
    map = L.map(elementId).setView([-17.825165, 31.033510], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OSM contributors',
        maxZoom: 19
    }).addTo(map);
    markersCluster = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
    map.addLayer(markersCluster);
    return map;
}

export function showUserLocation(mapInstance, callback) {
    if (!mapInstance) return;
    if (!navigator.geolocation) {
        showTemporaryMessage('⚠️ Geolocation not supported', '#dc3545', 3000);
        return;
    }
    const msg = showTemporaryMessage('📍 Getting your location...', '#0d6efd');
    navigator.geolocation.getCurrentPosition(
        (position) => {
            msg.remove();
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            if (userLocationMarker) mapInstance.removeLayer(userLocationMarker);
            if (userLocationCircle) mapInstance.removeLayer(userLocationCircle);
            userLocationMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                    html: '<div style="background:#4285f4;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 2px #4285f4;"></div>',
                    iconSize: [22, 22],
                    popupAnchor: [0, -11]
                })
            }).addTo(mapInstance).bindPopup('<b>You are here</b>').openPopup();
            userLocationCircle = L.circle([lat, lng], {
                radius: position.coords.accuracy,
                color: '#4285f4',
                fillColor: '#4285f4',
                fillOpacity: 0.1,
                weight: 1
            }).addTo(mapInstance);
            mapInstance.setView([lat, lng], 14);
            if (callback) callback(lat, lng);
        },
        (error) => {
            msg.remove();
            console.warn('Location error:', error.message);
            showTemporaryMessage('⚠️ Unable to get location. Using default map.', '#ffc107', 4000);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

export function addMarkers(mapInstance, hospitals, onMarkerClick) {
    if (!mapInstance || !markersCluster) return;
    markersCluster.clearLayers();
    hospitals.forEach(h => {
        const lat = parseFloat(h.latitude);
        const lng = parseFloat(h.longitude);
        if (isNaN(lat) || isNaN(lng)) return;
        const color = h.emergency_ready ? '#dc3545' : '#0d6efd';
        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                html: `<div style="background:${color};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.2);"><i class="fas fa-hospital" style="color:white;font-size:14px;"></i></div>`,
                iconSize: [28, 28],
                popupAnchor: [0, -14]
            })
        });
        marker.bindPopup(`
            <b>${h.name}</b><br>${h.address.substring(0,60)}<br>
            🏥 Health ${h.health_score || 'N/A'}/5 | 🛏️ ${h.bed_availability}<br>
            <button onclick="window.dispatchEvent(new CustomEvent('chatHospital', {detail:{id:${h.id}}}))">💬 Chat</button>
            <button onclick="window.dispatchEvent(new CustomEvent('directionsHospital', {detail:{id:${h.id}}}))">🧭 Directions</button>
            <button onclick="window.location.href='tel:${h.phone}'">📞 Call</button>
        `);
        marker.on('click', () => onMarkerClick?.(h));
        markersCluster.addLayer(marker);
    });
}

export function showRoute(mapInstance, hospital) {
    if (!mapInstance) return;
    if (routingControl) {
        try { mapInstance.removeControl(routingControl); } catch(e) {}
        routingControl = null;
    }
    if (!navigator.geolocation) return alert('Geolocation not supported');
    const msg = showTemporaryMessage('🔄 Calculating route...', '#0d6efd');
    navigator.geolocation.getCurrentPosition(pos => {
        msg.remove();
        const start = [pos.coords.latitude, pos.coords.longitude];
        const end = [parseFloat(hospital.latitude), parseFloat(hospital.longitude)];
        routingControl = L.Routing.control({
            waypoints: [L.latLng(start[0], start[1]), L.latLng(end[0], end[1])],
            routeWhileDragging: false,
            lineOptions: { styles: [{ color: '#0d6efd', weight: 5 }] },
            createMarker: () => null,
            fitSelectedRoutes: true,
            show: false
        }).addTo(mapInstance);
        routingControl.on('routesfound', (e) => {
            const route = e.routes[0];
            const steps = route.instructions;
            const dist = (route.summary.totalDistance / 1000).toFixed(1);
            const time = Math.round(route.summary.totalTime / 60);
            const stepsDiv = document.getElementById('stepsList');
            const panel = document.getElementById('routeInfo');
            if (stepsDiv && panel) {
                stepsDiv.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;">📏 ${dist} km | ⏱️ ${time} min</div>` +
                    steps.map(s => `<div style="padding:5px 0;border-bottom:1px solid #eee;"><small>${s.text}</small> <small>(${(s.distance||0).toFixed(0)}m)</small></div>`).join('');
                panel.classList.remove('hidden');
                // Reattach event listeners
                const audioBtn = document.getElementById('startAudioBtn');
                if (audioBtn) audioBtn.onclick = () => speakDirections(steps);
                const stopAudioBtn = document.getElementById('stopAudioBtn');
                if (stopAudioBtn) stopAudioBtn.onclick = () => stopSpeaking();
                const cancelBtn = document.getElementById('cancelDirectionsBtn');
                if (cancelBtn) cancelBtn.onclick = () => {
                    if (routingControl) { try { mapInstance.removeControl(routingControl); } catch(e) {} routingControl = null; }
                    panel.classList.add('hidden');
                    stopSpeaking();
                };
            }
        });
    }, () => { msg.remove(); alert('Enable location for directions'); });
}

function speakDirections(steps) {
    if (!window.speechSynthesis) return alert('Audio not supported');
    stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(steps.map(s => s.text).join('. Then '));
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    currentSpeechUtterance = utterance;
    window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        currentSpeechUtterance = null;
    }
}

export function clearRoute(mapInstance) {
    if (routingControl) { mapInstance.removeControl(routingControl); routingControl = null; }
    document.getElementById('routeInfo')?.classList.add('hidden');
    stopSpeaking();
}

function showTemporaryMessage(text, bgColor, duration = 3000) {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.cssText = `position:fixed;bottom:20px;right:20px;background:${bgColor};color:white;padding:8px 16px;border-radius:20px;z-index:9999;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.2);`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), duration);
    return div;
}