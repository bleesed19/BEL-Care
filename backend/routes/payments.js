const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');

// Hospital: submit registration payment
router.post('/register', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { method, transaction_reference } = req.body;
        if (!method || !transaction_reference) {
            return res.status(400).json({ error: 'Missing payment details' });
        }

        const userRes = await pool.query(
            'SELECT facility_id FROM users WHERE id = $1 AND role = $2',
            [userId, 'facility_admin']
        );
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: 'No hospital linked to this account' });
        }
        const hospitalId = userRes.rows[0].facility_id;

        const hospRes = await pool.query(
            'SELECT status, payment_stage FROM hospitals WHERE id = $1',
            [hospitalId]
        );
        if (hospRes.rows[0]?.status !== 'PENDING_REGISTRATION') {
            return res.status(400).json({ error: 'Invalid registration stage' });
        }

        const dup = await pool.query(
            'SELECT id FROM payments WHERE transaction_reference = $1',
            [transaction_reference]
        );
        if (dup.rows.length > 0) {
            return res.status(400).json({ error: 'Transaction reference already used' });
        }

        await pool.query(
            `INSERT INTO payments (hospital_id, amount, payment_type, method, transaction_reference, status)
             VALUES ($1, 10, 'registration', $2, $3, 'pending')`,
            [hospitalId, method, transaction_reference]
        );

        await pool.query(
            `UPDATE hospitals SET status = 'REGISTERED_PAID', payment_stage = 'registration' WHERE id = $1`,
            [hospitalId]
        );

        res.json({ message: 'Registration payment submitted. Awaiting super admin review.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Hospital: submit full payment (after approval)
router.post('/full', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { method, transaction_reference } = req.body;
        if (!method || !transaction_reference) {
            return res.status(400).json({ error: 'Missing payment details' });
        }

        const userRes = await pool.query(
            'SELECT facility_id FROM users WHERE id = $1 AND role = $2',
            [userId, 'facility_admin']
        );
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'Hospital not found' });
        const hospitalId = userRes.rows[0].facility_id;

        const hospRes = await pool.query(
            'SELECT status FROM hospitals WHERE id = $1',
            [hospitalId]
        );
        if (hospRes.rows[0]?.status !== 'APPROVED_PENDING_PAYMENT') {
            return res.status(400).json({ error: 'Hospital not approved for full payment' });
        }

        const dup = await pool.query(
            'SELECT id FROM payments WHERE transaction_reference = $1',
            [transaction_reference]
        );
        if (dup.rows.length > 0) return res.status(400).json({ error: 'Duplicate reference' });

        await pool.query(
            `INSERT INTO payments (hospital_id, amount, payment_type, method, transaction_reference, status)
             VALUES ($1, 50, 'full', $2, $3, 'pending')`,
            [hospitalId, method, transaction_reference]
        );

        res.json({ message: 'Full payment submitted. Waiting for super admin verification.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get payment history for a hospital (facility admin)
router.get('/history', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRes = await pool.query(
            'SELECT facility_id FROM users WHERE id = $1 AND role = $2',
            [userId, 'facility_admin']
        );
        if (userRes.rows.length === 0) return res.json([]);
        const hospitalId = userRes.rows[0].facility_id;
        const payments = await pool.query(
            'SELECT * FROM payments WHERE hospital_id = $1 ORDER BY created_at DESC',
            [hospitalId]
        );
        res.json(payments.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;