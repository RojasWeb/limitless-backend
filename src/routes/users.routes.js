/**
 * LIMITLESS BACKEND — RUTAS DE USUARIOS Y PERFILES
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

/**
 * PUT /api/v1/users/profile
 * Actualiza la información deportiva y personal del usuario en sesión.
 */
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { nombre, apellido, biografia, ciudad, foto_perfil, telefono } = req.body;

    const updateQuery = `
      UPDATE users SET
        nombre = COALESCE($1, nombre),
        apellido = COALESCE($2, apellido),
        biografia = COALESCE($3, biografia),
        ciudad = COALESCE($4, ciudad),
        foto_perfil = COALESCE($5, foto_perfil),
        telefono = COALESCE($6, telefono)
      WHERE id = $7
      RETURNING id, nombre, apellido, username, email, ciudad, biografia, foto_perfil, telefono
    `;

    const { rows } = await db.query(updateQuery, [
      nombre,
      apellido,
      biografia,
      ciudad,
      foto_perfil,
      telefono,
      req.user.id
    ]);

    return res.json({
      success: true,
      message: 'Perfil actualizado correctamente.',
      data: rows[0]
    });
  } catch (err) {
    console.error('Error en PUT /users/profile:', err);
    return res.status(500).json({ success: false, error: 'Error al actualizar el perfil.' });
  }
});

/**
 * GET /api/v1/users/:id/stats
 * Consulta las métricas de rendimiento deportivo calculadas desde vw_athlete_stats.
 */
router.get('/:id/stats', optionalAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { rows } = await db.query(
      'SELECT * FROM vw_athlete_stats WHERE user_id = $1',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Atleta no encontrado.' });
    }

    return res.json({
      success: true,
      data: rows[0]
    });
  } catch (err) {
    console.error('Error en GET /users/:id/stats:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar estadísticas del atleta.' });
  }
});

/**
 * GET /api/v1/users/connections
 * Listado de conexiones y amigos del atleta.
 */
router.get('/connections', requireAuth, async (req, res) => {
  try {
    const query = `
      SELECT uc.id, uc.estado, uc.fecha_solicitud,
             u.id as user_id, u.nombre, u.apellido, u.username, u.foto_perfil, u.ciudad
      FROM user_connections uc
      JOIN users u ON (CASE WHEN uc.usuario_id = $1 THEN uc.conectado_con_id ELSE uc.usuario_id END) = u.id
      WHERE (uc.usuario_id = $1 OR uc.conectado_con_id = $1)
      ORDER BY uc.fecha_solicitud DESC
    `;
    const { rows } = await db.query(query, [req.user.id]);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error en GET /users/connections:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar conexiones.' });
  }
});

/**
 * POST /api/v1/users/connections
 * Envía una solicitud de conexión entre deportistas.
 */
router.post('/connections', requireAuth, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const targetId = parseInt(targetUserId, 10);

    if (targetId === req.user.id) {
      return res.status(400).json({ success: false, error: 'No puedes enviarte una conexión a ti mismo.' });
    }

    const { rows } = await db.query(
      `INSERT INTO user_connections (usuario_id, conectado_con_id, estado)
       VALUES ($1, $2, 'pendiente')
       ON CONFLICT (usuario_id, conectado_con_id) DO UPDATE SET estado = 'pendiente'
       RETURNING *`,
      [req.user.id, targetId]
    );

    return res.status(201).json({ success: true, message: 'Solicitud de conexión enviada.', data: rows[0] });
  } catch (err) {
    console.error('Error en POST /users/connections:', err);
    return res.status(500).json({ success: false, error: 'Error al enviar conexión.' });
  }
});

module.exports = router;
