require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const pool = require('./db/pool');
const { checkExpiredHospitals } = require('./utils/expiry');

// Route imports
const authRoutes = require('./routes/auth');
const hospitalRoutes = require('./routes/hospitals');
const adminRoutes = require('./routes/admin');
const messageRoutes = require('./routes/messages');
const requestRoutes = require('./routes/requests');
const facilityRoutes = require('./routes/facility');
const paymentRoutes = require('./routes/payments');

const app = express();
const server = http.createServer(app);

// CORS – allow both local development and your live Vercel frontend
const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    process.env.FRONTEND_URL, // your Vercel URL, e.g. https://frontend-zeta-tan-83.vercel.app
].filter(Boolean); // remove undefined if FRONTEND_URL is not set

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`Blocked CORS request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files (images/videos)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/facility', facilityRoutes);
app.use('/api/payments', paymentRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

// Socket.io
const initializeSocket = require('./socket');
const io = initializeSocket(server);
app.set('io', io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
    console.log(`🚀 Backend running on http://localhost:${PORT}`);
    try {
        const res = await pool.query('SELECT COUNT(*) FROM users');
        console.log(`✅ Database connected, ${res.rows[0].count} users found`);
        // Run expiry check on startup
        await checkExpiredHospitals();
        // Set interval to check every hour
        setInterval(checkExpiredHospitals, 60 * 60 * 1000);
    } catch (err) {
        console.error('❌ Database error:', err.message);
    }
});