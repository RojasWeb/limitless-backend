/**
 * LIMITLESS BACKEND — RUTAS DE TICKETS DE SOPORTE
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

/**
 * POST /api/v1/support/tickets
 * Abre un ticket de soporte técnico, consulta de juntes, torneos o pedidos.
 */
router.post('/tickets', optionalAuth, async (req, res) => {
  try {
    const { name, email, categoria, asunto, mensaje } = req.body;

    if (!mensaje || !mensaje.trim()) {
      return res.status(400).json({ success: false, error: 'El mensaje de soporte no puede estar vacío.' });
    }

    const ticketCode = `TCK-${Date.now().toString().slice(-6)}`;
    const userEmail = req.user ? req.user.email : (email || 'anonimo@limitless.sport');
    const userName = req.user ? `${req.user.nombre} ${req.user.apellido || ''}`.trim() : (name || 'Visitante');
    const userId = req.user ? req.user.id : 1; // Fallback al usuario del sistema

    const insertTicket = `
      INSERT INTO support_tickets (
        user_id, ticket_code, asunto, categoria, descripcion, estado, prioridad
      ) VALUES ($1, $2, $3, $4, $5, 'abierto', 'media')
      RETURNING *
    `;

    const cleanSubject = asunto || `Consulta web de ${userName} (${categoria || 'general'})`;
    const cleanCategory = ['juntes', 'torneos', 'tienda', 'cuenta', 'alianzas', 'otro'].includes(categoria) ? categoria : 'otro';

    const { rows } = await db.query(insertTicket, [
      userId,
      ticketCode,
      cleanSubject,
      cleanCategory,
      mensaje.trim()
    ]);

    const ticket = rows[0];

    // Insertar el primer mensaje del hilo
    await db.query(
      `INSERT INTO support_messages (ticket_id, sender_id, es_admin, mensaje)
       VALUES ($1, $2, false, $3)`,
      [ticket.id, userId, mensaje.trim()]
    );

    return res.status(201).json({
      success: true,
      message: `¡Ticket #${ticketCode} creado con éxito! Nuestro equipo te contactará a ${userEmail}.`,
      data: {
        ticketCode: ticket.ticket_code,
        ticketId: ticket.id,
        asunto: ticket.asunto,
        fecha: ticket.fecha_creacion
      }
    });
  } catch (err) {
    console.error('Error en POST /support/tickets:', err);
    return res.status(500).json({ success: false, error: 'Error al procesar el ticket de soporte.' });
  }
});

/**
 * GET /api/v1/support/tickets
 * Lista los tickets creados por el usuario en sesión.
 */
router.get('/tickets', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM support_messages sm WHERE sm.ticket_id = t.id) as total_mensajes
       FROM support_tickets t
       WHERE t.user_id = $1
       ORDER BY t.fecha_creacion DESC`,
      [req.user.id]
    );

    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('Error en GET /support/tickets:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar tickets.' });
  }
});

module.exports = router;
