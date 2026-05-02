const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// GET all ACTIVE hospitals (approved and with status = 'ACTIVE')
router.get('/', async (req, res) => {
    try {
        const { lat, lng, emergency } = req.query;
        let query = `
            SELECT h.*, 
                   COALESCE(array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL), ARRAY[]::text[]) as services,
                   COALESCE(array_agg(DISTINCT s.id) FILTER (WHERE s.id IS NOT NULL), ARRAY[]::int[]) as service_ids,
                   MAX(hs.updated_at) as last_updated
            FROM hospitals h
            LEFT JOIN hospital_services hs ON h.id = hs.hospital_id AND hs.is_available = true
            LEFT JOIN services s ON hs.service_id = s.id
            WHERE h.is_approved = true AND h.status = 'ACTIVE'
        `;
        if (emergency === 'true') {
            query = query.replace('WHERE h.is_approved = true AND h.status = \'ACTIVE\'', 
                'WHERE h.is_approved = true AND h.status = \'ACTIVE\' AND h.emergency_ready = true AND s.name = \'Emergency Room\'');
        }
        query += ' GROUP BY h.id ORDER BY h.health_score DESC, h.name';
        const result = await pool.query(query);
        let hospitals = result.rows;
        if (lat && lng) {
            const userLat = parseFloat(lat);
            const userLng = parseFloat(lng);
            hospitals = hospitals.map(h => {
                const distance = getDistance(userLat, userLng, parseFloat(h.latitude), parseFloat(h.longitude));
                const bedScore = Math.min(h.bed_availability / 100, 1);
                const serviceScore = Math.min((h.services?.filter(s => s !== null).length || 0) / 10, 1);
                const emergencyScore = h.emergency_ready ? 0.2 : 0;
                const healthScore = (bedScore * 0.4 + serviceScore * 0.4 + emergencyScore * 0.2) * 5;
                h.health_score = Math.min(Math.max(healthScore, 0), 5).toFixed(1);
                h.distance = distance;
                return h;
            });
            hospitals.sort((a, b) => (a.distance || 0) - (b.distance || 0));
        }
        res.json(hospitals);
    } catch (error) {
        console.error('Error fetching hospitals:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET single hospital details
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT h.*, COALESCE(array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL), ARRAY[]::text[]) as services
            FROM hospitals h
            LEFT JOIN hospital_services hs ON h.id = hs.hospital_id AND hs.is_available = true
            LEFT JOIN services s ON hs.service_id = s.id
            WHERE h.id = $1 AND h.is_approved = true AND h.status = 'ACTIVE'
            GROUP BY h.id
        `, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Hospital not found' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET media for a hospital (public)
router.get('/:id/media', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT id, file_url, file_type, created_at FROM hospital_media WHERE hospital_id = $1 ORDER BY created_at DESC`,
            [id]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET services with availability for a hospital (public)
router.get('/:id/services', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT s.id, s.name, s.category, hs.is_available, hs.updated_at
             FROM services s
             LEFT JOIN hospital_services hs ON hs.service_id = s.id AND hs.hospital_id = $1
             ORDER BY s.name`,
            [id]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// FEEDBACK & RATINGS
router.post('/:id/feedback', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;
        if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
        await pool.query(
            'INSERT INTO feedback (user_id, hospital_id, rating, comment) VALUES ($1, $2, $3, $4)',
            [req.user.id, id, rating, comment || '']
        );
        res.json({ message: 'Thank you for your feedback' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:id/feedback', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT f.rating, f.comment, f.created_at, u.name as user_name
             FROM feedback f
             JOIN users u ON f.user_id = u.id
             WHERE f.hospital_id = $1
             ORDER BY f.created_at DESC`,
            [id]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:id/rating', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'SELECT COALESCE(AVG(rating), 0) as avg_rating, COUNT(*) as total FROM feedback WHERE hospital_id = $1',
            [id]
        );
        res.json({ avg_rating: parseFloat(result.rows[0].avg_rating), total: parseInt(result.rows[0].total) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Hospital admin update availability (bed, emergency)
router.put('/:id/availability', verifyToken, requireRole(['hospital_admin']), async (req, res) => {
    try {
        const { bed_availability, emergency_ready } = req.body;
        const hospitalId = parseInt(req.params.id);
        if (req.user.hospital_id !== hospitalId && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        await pool.query(
            'UPDATE hospitals SET bed_availability = COALESCE($1, bed_availability), emergency_ready = COALESCE($2, emergency_ready), updated_at = NOW() WHERE id = $3',
            [bed_availability, emergency_ready, hospitalId]
        );
        res.json({ message: 'Availability updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;