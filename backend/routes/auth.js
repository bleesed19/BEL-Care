const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const router = express.Router();

// ------------------- USER REGISTRATION (role = 'user') -------------------
router.post('/register', async (req, res) => {
    try {
        const { email, password, name, phone } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password and name are required' });
        }

        // Check if user exists
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (email, password, name, role, status) 
             VALUES ($1, $2, $3, 'user', 'active') 
             RETURNING id, email, name, role`,
            [email, hashedPassword, name]
        );

        const user = result.rows[0];
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({ token, user });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ------------------- FACILITY ADMIN REGISTRATION (requires approval) -------------------
router.post('/register-facility-admin', async (req, res) => {
    try {
        const { email, password, name, phone, facilityName, facilityAddress } = req.body;
        if (!email || !password || !name || !facilityName || !facilityAddress) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check existing user
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Create a pending hospital (latitude/longitude are optional, defaults to NULL)
        const hospitalResult = await pool.query(
            `INSERT INTO hospitals (name, address, phone, is_approved, bed_availability, emergency_ready) 
             VALUES ($1, $2, $3, false, 0, false) 
             RETURNING id`,
            [facilityName, facilityAddress, phone]
        );
        const facilityId = hospitalResult.rows[0].id;

        // Create facility admin with status = 'pending'
        const hashedPassword = await bcrypt.hash(password, 10);
        const userResult = await pool.query(
            `INSERT INTO users (email, password, name, role, status, facility_id) 
             VALUES ($1, $2, $3, 'facility_admin', 'pending', $4) 
             RETURNING id, email, name, role, status`,
            [email, hashedPassword, name, facilityId]
        );

        res.status(201).json({
            message: 'Registration submitted. Awaiting super admin approval.',
            user: userResult.rows[0]
        });
    } catch (error) {
        console.error('Facility admin registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ------------------- LOGIN (works for all roles) -------------------
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`Login attempt: ${email}`);

        const result = await pool.query(
            `SELECT id, email, name, password, role, status, facility_id 
             FROM users WHERE email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Check account status
        if (user.status === 'pending') {
            return res.status(403).json({ error: 'Account pending approval. Contact super admin.' });
        }
        if (user.status === 'suspended') {
            return res.status(403).json({ error: 'Account suspended. Contact support.' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // If facility admin, fetch hospital details
        let hospital = null;
        if (user.role === 'facility_admin' && user.facility_id) {
            const hospResult = await pool.query(
                'SELECT id, name, latitude, longitude, is_approved, emergency_ready, bed_availability FROM hospitals WHERE id = $1',
                [user.facility_id]
            );
            hospital = hospResult.rows[0] || null;
        }

        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.name,
                facility_id: user.facility_id
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                facility_id: user.facility_id,
                hospital
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ------------------- FORGOT PASSWORD -------------------
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const result = await pool.query('SELECT id, email FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.json({ message: 'If your email is registered, you will receive reset instructions.' });
        }
        const user = result.rows[0];
        const resetToken = Buffer.from(`${user.id}-${Date.now()}-${Math.random()}`).toString('base64');
        console.log(`[PASSWORD RESET] Email: ${email} | Token: ${resetToken}`);
        res.json({ message: 'Password reset link sent (check server console for demo token)' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;