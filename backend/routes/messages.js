const express = require('express');
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.get('/conversation/:hospitalId', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { hospitalId } = req.params;
        const result = await pool.query(`
            SELECT m.*, u.name as sender_name 
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE (m.sender_id = $1 AND m.hospital_id = $2) OR (m.receiver_id = $1 AND m.hospital_id = $2)
            ORDER BY m.created_at ASC
        `, [userId, hospitalId]);
        await pool.query(`
            UPDATE messages SET is_read = true, delivered = true 
            WHERE receiver_id = $1 AND hospital_id = $2 AND is_read = false
        `, [userId, hospitalId]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/send', verifyToken, async (req, res) => {
    try {
        const { hospital_id, message, receiver_id } = req.body;
        const sender_id = req.user.id;
        const result = await pool.query(
            `INSERT INTO messages (sender_id, receiver_id, hospital_id, message, delivered) 
             VALUES ($1, $2, $3, $4, true) RETURNING *`,
            [sender_id, receiver_id, hospital_id, message]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;