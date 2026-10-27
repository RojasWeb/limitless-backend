/**
 * LIMITLESS BACKEND — RUTAS DE AUDITORÍA Y DASHBOARD ADMINISTRATIVO
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

/**
 * GET /api/v1/audit/metrics
 * Métricas globales del dashboard tomadas de vw_admin_dashboard_metrics.
 */
router.get('/metrics', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM vw_admin_dashboard_metrics');
    return res.json({ success: true, data: rows[0] || {} });
  } catch (err) {
    console.error('Error en GET /audit/metrics:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar métricas del dashboard.' });
  }
});

/**
 * GET /api/v1/audit/logs
 * Registro histórico de operaciones de seguridad y auditoría.
 */
router.get('/logs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.*, u.nombre as admin_nombre, u.email as admin_email
       FROM audit_logs a
       LEFT JOIN users u ON a.admin_id = u.id
       ORDER BY a.fecha DESC
       LIMIT 100`
    );
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('Error en GET /audit/logs:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar registros de auditoría.' });
  }
});

module.exports = router;
