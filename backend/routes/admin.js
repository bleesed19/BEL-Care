const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// All routes require super_admin role
router.use(verifyToken, requireRole(['super_admin']));

// ========== DASHBOARD STATS (SAFE VERSION) ==========
router.get('/stats', async (req, res) => {
    try {
        const [totalUsers, totalHospitals, totalMessages, pendingAdmins] = await Promise.all([
            pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'user'"),
            pool.query("SELECT COUNT(*) as count FROM hospitals"),
            pool.query("SELECT COUNT(*) as count FROM messages"),
            pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'facility_admin' AND status = 'pending'")
        ]);
        res.json({
            total_users: parseInt(totalUsers.rows[0]?.count || 0),
            total_hospitals: parseInt(totalHospitals.rows[0]?.count || 0),
            total_messages: parseInt(totalMessages.rows[0]?.count || 0),
            pending_admins: parseInt(pendingAdmins.rows[0]?.count || 0)
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== PENDING FACILITY ADMINS (unchanged) ==========
router.get('/pending-facility-admins', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.email, u.name, u.created_at, h.name as facility_name, h.address as facility_address
             FROM users u
             JOIN hospitals h ON u.facility_id = h.id
             WHERE u.role = 'facility_admin' AND u.status = 'pending'
             ORDER BY u.created_at DESC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/approve-facility-admin/:userId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { userId } = req.params;
        await client.query('BEGIN');
        const userRes = await client.query(
            'SELECT facility_id FROM users WHERE id = $1 AND role = $2',
            [userId, 'facility_admin']
        );
        if (userRes.rows.length === 0) throw new Error('User not found');
        const facilityId = userRes.rows[0].facility_id;
        await client.query('UPDATE users SET status = $1 WHERE id = $2', ['active', userId]);
        await client.query('UPDATE hospitals SET is_approved = $1 WHERE id = $2', [true, facilityId]);
        await client.query('COMMIT');
        res.json({ message: 'Facility admin and hospital approved' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

router.delete('/reject-facility-admin/:userId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { userId } = req.params;
        await client.query('BEGIN');
        const userRes = await client.query(
            'SELECT facility_id FROM users WHERE id = $1 AND role = $2',
            [userId, 'facility_admin']
        );
        if (userRes.rows.length === 0) throw new Error('User not found');
        const facilityId = userRes.rows[0].facility_id;
        await client.query('DELETE FROM users WHERE id = $1', [userId]);
        if (facilityId) await client.query('DELETE FROM hospitals WHERE id = $1', [facilityId]);
        await client.query('COMMIT');
        res.json({ message: 'Rejected and removed' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// ========== MANAGE HOSPITALS (unchanged) ==========
router.get('/hospitals', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT h.*, u.email as admin_email, u.name as admin_name
             FROM hospitals h
             LEFT JOIN users u ON h.admin_id = u.id
             ORDER BY h.created_at DESC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/hospitals', async (req, res) => {
    try {
        const { name, address, latitude, longitude, phone, emergency_ready, bed_availability } = req.body;
        const result = await pool.query(
            `INSERT INTO hospitals (name, address, latitude, longitude, phone, emergency_ready, bed_availability, is_approved)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING *`,
            [name, address, latitude, longitude, phone, emergency_ready || false, bed_availability || 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/hospitals/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, address, latitude, longitude, phone, emergency_ready, bed_availability } = req.body;
        const result = await pool.query(
            `UPDATE hospitals SET name=$1, address=$2, latitude=$3, longitude=$4, phone=$5, emergency_ready=$6, bed_availability=$7
             WHERE id=$8 RETURNING *`,
            [name, address, latitude, longitude, phone, emergency_ready, bed_availability, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/hospitals/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM hospitals WHERE id = $1', [req.params.id]);
        res.json({ message: 'Hospital deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== MANAGE USERS (unchanged) ==========
router.get('/users', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, email, name, role, status, facility_id, created_at FROM users ORDER BY created_at DESC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/users/:id/suspend', async (req, res) => {
    try {
        await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['suspended', req.params.id]);
        res.json({ message: 'User suspended' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/users/:id/activate', async (req, res) => {
    try {
        await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['active', req.params.id]);
        res.json({ message: 'User activated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== FEEDBACK & RATINGS (unchanged) ==========
router.get('/feedback', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT f.id, f.rating, f.comment, f.created_at,
                   u.name as user_name, u.email as user_email,
                   h.name as hospital_name, h.id as hospital_id
            FROM feedback f
            JOIN users u ON f.user_id = u.id
            JOIN hospitals h ON f.hospital_id = h.id
            ORDER BY f.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Feedback error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== PAYMENT MANAGEMENT (FIXED) ==========
// All payments (for Payment Management tab)
router.get('/payments', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, h.name as hospital_name
            FROM payments p
            JOIN hospitals h ON p.hospital_id = h.id
            ORDER BY p.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Payments error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Pending payments (for Payment Reminders tab)
router.get('/pending-payments', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, 
                   u.name as user_name, u.email as user_email,
                   h.name as hospital_name, h.admin_id as facility_admin_id,
                   r.patient_name, r.notes
            FROM payments p
            JOIN requests r ON p.request_id = r.id
            JOIN users u ON p.user_id = u.id
            JOIN hospitals h ON p.hospital_id = h.id
            WHERE p.status = 'pending'
            ORDER BY p.created_at ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Pending payments error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/payment-reminder/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { message } = req.body;
        const paymentRes = await pool.query(`
            SELECT p.*, r.hospital_id, r.user_id, h.admin_id as facility_admin_id
            FROM payments p
            JOIN requests r ON p.request_id = r.id
            JOIN hospitals h ON r.hospital_id = h.id
            WHERE p.id = $1
        `, [paymentId]);
        if (paymentRes.rows.length === 0) return res.status(404).json({ error: 'Payment not found' });
        const payment = paymentRes.rows[0];
        const reminderText = message || `Reminder: Payment of $${payment.amount} for ambulance request is still pending.`;
        if (payment.facility_admin_id) {
            await pool.query(
                `INSERT INTO notifications (user_id, message, type, read) VALUES ($1, $2, 'payment', false)`,
                [payment.facility_admin_id, `Payment reminder for request #${payment.request_id}: ${reminderText}`]
            );
        }
        await pool.query(
            `INSERT INTO notifications (user_id, message, type, read) VALUES ($1, $2, 'payment', false)`,
            [payment.user_id, `Payment reminder: ${reminderText}`]
        );
        res.json({ message: 'Reminder sent' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== REGISTRATION QUEUE (unchanged) ==========
router.get('/registration-queue', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT h.*, u.name as admin_name, u.email as admin_email
            FROM hospitals h
            JOIN users u ON h.admin_id = u.id
            WHERE h.status = 'REGISTERED_PAID'
            ORDER BY h.created_at ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Registration queue error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.patch('/hospitals/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(
            `UPDATE hospitals SET status = 'APPROVED_PENDING_PAYMENT', approval_date = NOW() WHERE id = $1`,
            [id]
        );
        const adminRes = await pool.query('SELECT admin_id FROM hospitals WHERE id = $1', [id]);
        if (adminRes.rows[0]?.admin_id) {
            await pool.query(
                `INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, 'approval')`,
                [adminRes.rows[0].admin_id, 'Your hospital has been approved. Please complete the full payment to activate.']
            );
        }
        res.json({ message: 'Hospital approved, pending full payment' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.patch('/hospitals/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`UPDATE hospitals SET status = 'REJECTED' WHERE id = $1`, [id]);
        const adminRes = await pool.query('SELECT admin_id FROM hospitals WHERE id = $1', [id]);
        if (adminRes.rows[0]?.admin_id) {
            await pool.query(
                `INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, 'rejection')`,
                [adminRes.rows[0].admin_id, 'Your registration has been rejected. Please contact support.']
            );
        }
        res.json({ message: 'Hospital rejected' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== PENDING FULL PAYMENTS (unchanged) ==========
router.get('/pending-full-payments', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT h.*, u.name as admin_name, u.email as admin_email,
                   p.transaction_reference, p.method, p.created_at as payment_submitted_at
            FROM hospitals h
            JOIN users u ON h.admin_id = u.id
            JOIN payments p ON p.hospital_id = h.id AND p.payment_type = 'full' AND p.status = 'pending'
            WHERE h.status = 'APPROVED_PENDING_PAYMENT'
            ORDER BY p.created_at ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Pending full payments error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.patch('/hospitals/:id/activate', async (req, res) => {
    try {
        const { id } = req.params;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        await pool.query(
            `UPDATE hospitals SET status = 'ACTIVE', subscription_expiry = $1 WHERE id = $2`,
            [expiry, id]
        );
        await pool.query(
            `UPDATE payments SET status = 'completed' 
             WHERE hospital_id = $1 AND payment_type = 'full' AND status = 'pending'`,
            [id]
        );
        const adminRes = await pool.query('SELECT admin_id FROM hospitals WHERE id = $1', [id]);
        if (adminRes.rows[0]?.admin_id) {
            await pool.query(
                `INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, 'activation')`,
                [adminRes.rows[0].admin_id, 'Your hospital is now ACTIVE. It will appear on the user map.']
            );
        }
        res.json({ message: 'Hospital activated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.patch('/hospitals/:id/suspend', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`UPDATE hospitals SET status = 'SUSPENDED' WHERE id = $1`, [id]);
        res.json({ message: 'Hospital suspended' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== ACTIVE SUBSCRIPTIONS (unchanged) ==========
router.get('/active-subscriptions', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT h.id, h.name, h.subscription_expiry, u.email as admin_email
            FROM hospitals h
            JOIN users u ON h.admin_id = u.id
            WHERE h.status = 'ACTIVE' AND (h.subscription_expiry > NOW() OR h.subscription_expiry IS NULL)
            ORDER BY h.subscription_expiry ASC NULLS LAST
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Active subscriptions error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;