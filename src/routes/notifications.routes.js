/**
 * LIMITLESS BACKEND — RUTAS DE NOTIFICACIONES
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/v1/notifications
 * Bandeja de notificaciones del deportista.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY fecha_creacion DESC 
       LIMIT 50`,
      [req.user.id]
    );

    const unreadCount = rows.filter(n => !n.leido).length;

    return res.json({
      success: true,
      unreadCount,
      data: rows
    });
  } catch (err) {
    console.error('Error en GET /notifications:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar notificaciones.' });
  }
});

/**
 * PUT /api/v1/notifications/:id/read
 * Marca una notificación como leída.
 */
router.put('/:id/read', requireAuth, async (req, res) => {
  try {
    const notifId = parseInt(req.params.id, 10);
    await db.query(
      'UPDATE notifications SET leido = true WHERE id = $1 AND user_id = $2',
      [notifId, req.user.id]
    );
    return res.json({ success: true, message: 'Notificación marcada como leída.' });
  } catch (err) {
    console.error('Error en PUT /notifications/:id/read:', err);
    return res.status(500).json({ success: false, error: 'Error al actualizar notificación.' });
  }
});

/**
 * PUT /api/v1/notifications/read-all
 * Marca todas las notificaciones como leídas.
 */
router.put('/read-all', requireAuth, async (req, res) => {
  try {
    await db.query('UPDATE notifications SET leido = true WHERE user_id = $1', [req.user.id]);
    return res.json({ success: true, message: 'Todas las notificaciones han sido marcadas como leídas.' });
  } catch (err) {
    console.error('Error en PUT /notifications/read-all:', err);
    return res.status(500).json({ success: false, error: 'Error al marcar notificaciones.' });
  }
});

module.exports = router;
