const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.use(verifyToken, requireRole(['facility_admin']));

// Get own facility
router.get('/my-facility', async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT h.* FROM hospitals h
             JOIN users u ON u.facility_id = h.id
             WHERE u.id = $1`,
            [userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update bed availability & emergency
router.put('/update-availability', async (req, res) => {
    try {
        const { bed_availability, emergency_ready } = req.body;
        const userId = req.user.id;
        const facilityRes = await pool.query(
            `SELECT h.id FROM hospitals h JOIN users u ON u.facility_id = h.id WHERE u.id = $1`,
            [userId]
        );
        if (facilityRes.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        const hospitalId = facilityRes.rows[0].id;
        await pool.query(
            `UPDATE hospitals SET bed_availability = COALESCE($1, bed_availability), emergency_ready = COALESCE($2, emergency_ready)
             WHERE id = $3`,
            [bed_availability, emergency_ready, hospitalId]
        );
        res.json({ message: 'Availability updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== SERVICES ==========
router.get('/services', async (req, res) => {
    try {
        const userId = req.user.id;
        const facilityRes = await pool.query(
            `SELECT h.id FROM hospitals h JOIN users u ON u.facility_id = h.id WHERE u.id = $1`,
            [userId]
        );
        if (facilityRes.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        const hospitalId = facilityRes.rows[0].id;
        const result = await pool.query(
            `SELECT s.id, s.name, s.category, hs.is_available, hs.updated_at
             FROM services s
             LEFT JOIN hospital_services hs ON hs.service_id = s.id AND hs.hospital_id = $1
             ORDER BY s.name`,
            [hospitalId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/services', async (req, res) => {
    try {
        const { service_name, category } = req.body;
        if (!service_name) return res.status(400).json({ error: 'Service name required' });
        const userId = req.user.id;
        const facilityRes = await pool.query(
            `SELECT h.id FROM hospitals h JOIN users u ON u.facility_id = h.id WHERE u.id = $1`,
            [userId]
        );
        if (facilityRes.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        const hospitalId = facilityRes.rows[0].id;
        let serviceId;
        const existing = await pool.query('SELECT id FROM services WHERE name = $1', [service_name]);
        if (existing.rows.length === 0) {
            const newService = await pool.query(
                'INSERT INTO services (name, category) VALUES ($1, $2) RETURNING id',
                [service_name, category || null]
            );
            serviceId = newService.rows[0].id;
        } else {
            serviceId = existing.rows[0].id;
        }
        await pool.query(
            `INSERT INTO hospital_services (hospital_id, service_id, is_available)
             VALUES ($1, $2, true)
             ON CONFLICT (hospital_id, service_id) DO UPDATE SET is_available = true, updated_at = NOW()`,
            [hospitalId, serviceId]
        );
        res.status(201).json({ message: 'Service added' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/services/:serviceId', async (req, res) => {
    try {
        const { serviceId } = req.params;
        const { is_available } = req.body;
        const userId = req.user.id;
        const facilityRes = await pool.query(
            `SELECT h.id FROM hospitals h JOIN users u ON u.facility_id = h.id WHERE u.id = $1`,
            [userId]
        );
        if (facilityRes.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        const hospitalId = facilityRes.rows[0].id;
        await pool.query(
            `UPDATE hospital_services SET is_available = $1, updated_at = NOW()
             WHERE hospital_id = $2 AND service_id = $3`,
            [is_available, hospitalId, serviceId]
        );
        res.json({ message: 'Service updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/services/:serviceId', async (req, res) => {
    try {
        const { serviceId } = req.params;
        const userId = req.user.id;
        const facilityRes = await pool.query(
            `SELECT h.id FROM hospitals h JOIN users u ON u.facility_id = h.id WHERE u.id = $1`,
            [userId]
        );
        if (facilityRes.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        const hospitalId = facilityRes.rows[0].id;
        await pool.query(
            'DELETE FROM hospital_services WHERE hospital_id = $1 AND service_id = $2',
            [hospitalId, serviceId]
        );
        res.json({ message: 'Service removed' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== MEDIA ==========
router.post('/media', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const userId = req.user.id;
        const facilityRes = await pool.query(
            `SELECT h.id FROM hospitals h JOIN users u ON u.facility_id = h.id WHERE u.id = $1`,
            [userId]
        );
        if (facilityRes.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        const hospitalId = facilityRes.rows[0].id;
        const fileUrl = `/uploads/${req.file.filename}`;
        const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
        await pool.query(
            `INSERT INTO hospital_media (hospital_id, file_url, file_type, created_at)
             VALUES ($1, $2, $3, NOW())`,
            [hospitalId, fileUrl, fileType]
        );
        res.json({ message: 'Media uploaded', url: fileUrl, type: fileType });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/media', async (req, res) => {
    try {
        const userId = req.user.id;
        const facilityRes = await pool.query(
            `SELECT h.id FROM hospitals h JOIN users u ON u.facility_id = h.id WHERE u.id = $1`,
            [userId]
        );
        if (facilityRes.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        const hospitalId = facilityRes.rows[0].id;
        const result = await pool.query(
            `SELECT id, file_url, file_type, created_at FROM hospital_media WHERE hospital_id = $1 ORDER BY created_at DESC`,
            [hospitalId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/media/:mediaId', async (req, res) => {
    try {
        const { mediaId } = req.params;
        const userId = req.user.id;
        const facilityRes = await pool.query(
            `SELECT h.id FROM hospitals h JOIN users u ON u.facility_id = h.id WHERE u.id = $1`,
            [userId]
        );
        if (facilityRes.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        const hospitalId = facilityRes.rows[0].id;
        const mediaRes = await pool.query(
            'DELETE FROM hospital_media WHERE id = $1 AND hospital_id = $2 RETURNING file_url',
            [mediaId, hospitalId]
        );
        if (mediaRes.rows.length > 0) {
            const filePath = path.join(uploadDir, path.basename(mediaRes.rows[0].file_url));
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        res.json({ message: 'Media deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== MESSAGES (CHAT) ==========
router.get('/messages', async (req, res) => {
    try {
        const userId = req.user.id;
        const facilityRes = await pool.query(
            `SELECT h.id FROM hospitals h JOIN users u ON u.facility_id = h.id WHERE u.id = $1`,
            [userId]
        );
        if (facilityRes.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        const hospitalId = facilityRes.rows[0].id;
        const result = await pool.query(
            `SELECT m.*, u_sender.name as sender_name, u_sender.id as sender_id
             FROM messages m
             JOIN users u_sender ON m.sender_id = u_sender.id
             WHERE m.hospital_id = $1
             ORDER BY m.created_at DESC`,
            [hospitalId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Messages error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/messages/reply', async (req, res) => {
    try {
        const { user_id, message } = req.body;
        if (!user_id || !message) return res.status(400).json({ error: 'Missing fields' });
        const userId = req.user.id;
        const facilityRes = await pool.query(
            `SELECT h.id FROM hospitals h JOIN users u ON u.facility_id = h.id WHERE u.id = $1`,
            [userId]
        );
        if (facilityRes.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        const hospitalId = facilityRes.rows[0].id;
        await pool.query(
            `INSERT INTO messages (sender_id, receiver_id, hospital_id, message, delivered)
             VALUES ($1, $2, $3, $4, true)`,
            [userId, user_id, hospitalId, message]
        );
        const io = req.app.get('io');
        if (io) io.to(`user_${user_id}`).emit('new_message', { hospital_id: hospitalId, message });
        res.json({ message: 'Reply sent' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== REQUESTS – separate ambulance and service ==========
router.get('/ambulance-requests', async (req, res) => {
    try {
        const userId = req.user.id;
        const facilityRes = await pool.query(
            `SELECT h.id FROM hospitals h JOIN users u ON u.facility_id = h.id WHERE u.id = $1`,
            [userId]
        );
        if (facilityRes.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        const hospitalId = facilityRes.rows[0].id;
        // service_id = 1 is ambulance (assuming)
        const result = await pool.query(
            `SELECT r.*, u.name as user_name, s.name as service_name
             FROM requests r
             JOIN users u ON r.user_id = u.id
             JOIN services s ON r.service_id = s.id
             WHERE r.hospital_id = $1 AND s.id = 1
             ORDER BY r.created_at DESC`,
            [hospitalId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/service-requests', async (req, res) => {
    try {
        const userId = req.user.id;
        const facilityRes = await pool.query(
            `SELECT h.id FROM hospitals h JOIN users u ON u.facility_id = h.id WHERE u.id = $1`,
            [userId]
        );
        if (facilityRes.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        const hospitalId = facilityRes.rows[0].id;
        // service_id != 1 (non‑ambulance)
        const result = await pool.query(
            `SELECT r.*, u.name as user_name, s.name as service_name
             FROM requests r
             JOIN users u ON r.user_id = u.id
             JOIN services s ON r.service_id = s.id
             WHERE r.hospital_id = $1 AND s.id != 1
             ORDER BY r.created_at DESC`,
            [hospitalId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Keep old /requests for backward compatibility (optional)
router.get('/requests', async (req, res) => {
    try {
        const userId = req.user.id;
        const facilityRes = await pool.query(
            `SELECT h.id FROM hospitals h JOIN users u ON u.facility_id = h.id WHERE u.id = $1`,
            [userId]
        );
        if (facilityRes.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        const hospitalId = facilityRes.rows[0].id;
        const result = await pool.query(
            `SELECT r.*, u.name as user_name, s.name as service_name
             FROM requests r
             JOIN users u ON r.user_id = u.id
             JOIN services s ON r.service_id = s.id
             WHERE r.hospital_id = $1
             ORDER BY r.created_at DESC`,
            [hospitalId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/requests/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        if (!['pending', 'accepted', 'rejected', 'completed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        const userId = req.user.id;
        const facilityRes = await pool.query(
            `SELECT h.id FROM hospitals h JOIN users u ON u.facility_id = h.id WHERE u.id = $1`,
            [userId]
        );
        if (facilityRes.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        const hospitalId = facilityRes.rows[0].id;
        const reqCheck = await pool.query('SELECT user_id FROM requests WHERE id = $1 AND hospital_id = $2', [id, hospitalId]);
        if (reqCheck.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
        const userIdRequester = reqCheck.rows[0].user_id;
        await pool.query(`UPDATE requests SET status = $1, notes = COALESCE($2, notes), updated_at = NOW() WHERE id = $3`, [status, notes, id]);
        if (status === 'accepted') {
            const paymentToken = Math.random().toString(36).substring(2, 10);
            await pool.query(
                `INSERT INTO payments (request_id, user_id, hospital_id, amount, status, payment_token)
                 VALUES ($1, $2, $3, 50.00, 'pending', $4)`,
                [id, userIdRequester, hospitalId, paymentToken]
            );
            // Send notification to user
            await pool.query(
                `INSERT INTO notifications (user_id, message, type, read)
                 VALUES ($1, $2, 'ambulance', false)`,
                [userIdRequester, `Your ambulance request has been approved. Please complete payment of $50 using token: ${paymentToken}`]
            );
        } else if (status === 'rejected') {
            await pool.query(
                `INSERT INTO notifications (user_id, message, type, read)
                 VALUES ($1, $2, 'ambulance', false)`,
                [userIdRequester, notes || 'Your request was rejected. Please contact the hospital.']
            );
        }
        res.json({ message: `Request ${status}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/requests/:id/payment', async (req, res) => {
    try {
        const { id } = req.params;
        const { payment_token } = req.body;
        const userId = req.user.id;
        const facilityRes = await pool.query(
            `SELECT h.id FROM hospitals h JOIN users u ON u.facility_id = h.id WHERE u.id = $1`,
            [userId]
        );
        if (facilityRes.rows.length === 0) return res.status(404).json({ error: 'Facility not found' });
        const hospitalId = facilityRes.rows[0].id;
        const payment = await pool.query(
            `SELECT p.id, p.request_id FROM payments p
             JOIN requests r ON r.id = p.request_id
             WHERE p.request_id = $1 AND p.payment_token = $2 AND p.status = 'pending'`,
            [id, payment_token]
        );
        if (payment.rows.length === 0) return res.status(400).json({ error: 'Invalid or already used token' });
        await pool.query('UPDATE payments SET status = $1 WHERE id = $2', ['completed', payment.rows[0].id]);
        await pool.query('UPDATE requests SET status = $1, updated_at = NOW() WHERE id = $2', ['dispatched', id]);
        const reqInfo = await pool.query('SELECT user_id FROM requests WHERE id = $1', [id]);
        const userIdRequester = reqInfo.rows[0].user_id;
        await pool.query(
            `INSERT INTO notifications (user_id, message, type, read)
             VALUES ($1, $2, 'ambulance', false)`,
            [userIdRequester, 'Payment successful. Ambulance is on route!']
        );
        res.json({ message: 'Ambulance dispatched' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;