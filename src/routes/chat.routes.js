/**
 * LIMITLESS BACKEND — RUTAS DE CHAT Y MENSAJERÍA
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/v1/chat/conversations
 * Salas de chat activas del deportista (grupales o privadas).
 */
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const query = `
      SELECT c.*, s.nombre as deporte_nombre,
             (SELECT m.contenido FROM messages m WHERE m.conversation_id = c.id ORDER BY m.fecha_envio DESC LIMIT 1) as ultimo_mensaje,
             (SELECT m.fecha_envio FROM messages m WHERE m.conversation_id = c.id ORDER BY m.fecha_envio DESC LIMIT 1) as ultimo_mensaje_fecha
      FROM conversations c
      JOIN conversation_members cm ON c.id = cm.conversation_id
      LEFT JOIN sports s ON c.deporte_id = s.id
      WHERE cm.user_id = $1
      ORDER BY ultimo_mensaje_fecha DESC NULLS LAST
    `;
    const { rows } = await db.query(query, [req.user.id]);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error en GET /chat/conversations:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar conversaciones.' });
  }
});

/**
 * GET /api/v1/chat/conversations/:id/messages
 * Historial de mensajes de una conversación.
 */
router.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const convId = parseInt(req.params.id, 10);

    // Verificar que el usuario pertenezca a la sala
    const isMember = await db.query(
      'SELECT id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [convId, req.user.id]
    );

    if (isMember.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'No perteneces a esta conversación.' });
    }

    const { rows } = await db.query(
      `SELECT m.*, u.nombre as sender_nombre, u.apellido as sender_apellido, u.username as sender_username, u.foto_perfil as sender_avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.fecha_envio ASC
       LIMIT 100`,
      [convId]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error en GET /chat/conversations/:id/messages:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar mensajes.' });
  }
});

/**
 * POST /api/v1/chat/conversations/:id/messages
 * Envía un mensaje a la sala de chat.
 */
router.post('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const convId = parseInt(req.params.id, 10);
    const { contenido, url_adjunto } = req.body;

    if (!contenido || !contenido.trim()) {
      return res.status(400).json({ success: false, error: 'El mensaje no puede estar vacío.' });
    }

    const insertQuery = `
      INSERT INTO messages (conversation_id, sender_id, contenido, url_adjunto, tipo)
      VALUES ($1, $2, $3, $4, 'texto')
      RETURNING *
    `;

    const { rows } = await db.query(insertQuery, [
      convId,
      req.user.id,
      contenido.trim(),
      url_adjunto || null
    ]);

    // Actualizar fecha_actualizacion de la conversación
    await db.query('UPDATE conversations SET fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1', [convId]);

    return res.status(201).json({
      success: true,
      data: {
        ...rows[0],
        sender_nombre: req.user.nombre,
        sender_avatar: req.user.foto_perfil
      }
    });
  } catch (err) {
    console.error('Error en POST /chat/conversations/:id/messages:', err);
    return res.status(500).json({ success: false, error: 'Error al enviar mensaje.' });
  }
});

module.exports = router;
