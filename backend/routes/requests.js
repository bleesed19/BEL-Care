const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// User requests a service from hospital
router.post('/', verifyToken, async (req, res) => {
    try {
        const { hospital_id, service_id, patient_name, notes } = req.body;
        const result = await pool.query(
            'INSERT INTO requests (user_id, hospital_id, service_id, patient_name, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [req.user.id, hospital_id, service_id, patient_name, notes]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get requests for a hospital (hospital admin)
router.get('/hospital/:hospitalId', verifyToken, requireRole(['hospital_admin']), async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.*, u.full_name as user_name, u.phone, s.name as service_name
            FROM requests r
            JOIN users u ON r.user_id = u.id
            JOIN services s ON r.service_id = s.id
            WHERE r.hospital_id = $1
            ORDER BY r.created_at DESC
        `, [req.params.hospitalId]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update request status (accept/reject)
router.put('/:id/status', verifyToken, async (req, res) => {
    try {
        const { status } = req.body;
        const result = await pool.query(
            'UPDATE requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [status, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;