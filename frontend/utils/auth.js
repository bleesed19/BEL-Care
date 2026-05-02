// frontend/utils/auth.js
const API_BASE = 'http://localhost:5000/api';

export function setAuth(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
}

export function getToken() {
    return localStorage.getItem('token');
}

export function getUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

export function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

export async function login(email, password) {
    const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Login failed');
    }
    // Ensure user role is preserved
    if (data.user && data.user.role !== 'user') {
        // If not a regular user, clear storage and throw
        localStorage.clear();
        throw new Error('This portal is for patients only. Please use the correct login page.');
    }
    setAuth(data.token, data.user);
    return data.user;
}

export async function register(full_name, email, phone, password) {
    const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name, email, phone, password, role: 'user' })
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
    }
    setAuth(data.token, data.user);
    return data.user;
}

export async function forgotPassword(email) {
    const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
}

export function initAuth(onLoginCallback) {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const modal = document.getElementById('authModal');
    const closeModal = document.querySelector('#authModal .close');
    
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotForm = document.getElementById('forgotPasswordForm');
    
    const switchToRegister = document.getElementById('switchToRegister');
    const switchToLogin = document.getElementById('switchToLogin');
    const forgotLink = document.getElementById('forgotPasswordLink');
    const backToLogin = document.getElementById('backToLogin');
    
    function showLogin() {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        forgotForm.classList.add('hidden');
    }
    function showRegister() {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        forgotForm.classList.add('hidden');
    }
    function showForgot() {
        loginForm.classList.add('hidden');
        registerForm.classList.add('hidden');
        forgotForm.classList.remove('hidden');
    }
    
    if (loginBtn) loginBtn.onclick = () => { showLogin(); modal.classList.remove('hidden'); };
    if (registerBtn) registerBtn.onclick = () => { showRegister(); modal.classList.remove('hidden'); };
    if (closeModal) closeModal.onclick = () => modal.classList.add('hidden');
    if (switchToRegister) switchToRegister.onclick = (e) => { e.preventDefault(); showRegister(); };
    if (switchToLogin) switchToLogin.onclick = (e) => { e.preventDefault(); showLogin(); };
    if (forgotLink) forgotLink.onclick = (e) => { e.preventDefault(); showForgot(); };
    if (backToLogin) backToLogin.onclick = (e) => { e.preventDefault(); showLogin(); };
    
    document.getElementById('submitLogin')?.addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        try {
            const user = await login(email, password);
            modal.classList.add('hidden');
            if (onLoginCallback) onLoginCallback(user);
            // Reload to update UI (optional, but consistent)
            location.reload();
        } catch (err) {
            alert(err.message);
        }
    });
    
    document.getElementById('submitRegister')?.addEventListener('click', async () => {
        const full_name = document.getElementById('regFullName').value;
        const email = document.getElementById('regEmail').value;
        const phone = document.getElementById('regPhone').value;
        const password = document.getElementById('regPassword').value;
        if (!full_name || !email || !phone || !password) {
            alert('Please fill all fields');
            return;
        }
        try {
            const user = await register(full_name, email, phone, password);
            modal.classList.add('hidden');
            if (onLoginCallback) onLoginCallback(user);
            location.reload();
        } catch (err) {
            alert(err.message);
        }
    });
    
    document.getElementById('submitForgot')?.addEventListener('click', async () => {
        const email = document.getElementById('forgotEmail').value;
        if (!email) {
            alert('Please enter your email');
            return;
        }
        try {
            const result = await forgotPassword(email);
            alert(result.message || 'Reset link sent (check server console)');
            showLogin();
        } catch (err) {
            alert(err.message);
        }
    });
}