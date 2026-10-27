/**
 * LIMITLESS BACKEND — RUTAS DE EQUIPOS Y CLUBES
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/v1/teams
 * Lista los equipos y clubes deportivos creados.
 */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT t.*, s.nombre as deporte_nombre, s.slug as deporte_slug,
              u.nombre as creador_nombre, u.apellido as creador_apellido,
              (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as total_jugadores
       FROM teams t
       JOIN sports s ON t.deporte_id = s.id
       JOIN users u ON t.creador_id = u.id
       WHERE t.estado = 'activo'
       ORDER BY t.id DESC`
    );
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('Error en GET /teams:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar equipos.' });
  }
});

/**
 * GET /api/v1/teams/:id
 * Detalle del equipo con su nómina de jugadores.
 */
router.get('/:id', async (req, res) => {
  try {
    const teamId = parseInt(req.params.id, 10);
    const { rows } = await db.query(
      `SELECT t.*, s.nombre as deporte_nombre, u.nombre as creador_nombre 
       FROM teams t 
       JOIN sports s ON t.deporte_id = s.id 
       JOIN users u ON t.creador_id = u.id 
       WHERE t.id = $1`,
      [teamId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Equipo no encontrado.' });
    }

    const team = rows[0];

    const membersQuery = await db.query(
      `SELECT tm.id, tm.rol, tm.dorsal, tm.posicion, tm.fecha_ingreso,
              u.id as user_id, u.nombre, u.apellido, u.username, u.foto_perfil
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = $1
       ORDER BY tm.rol DESC, tm.dorsal ASC`,
      [teamId]
    );

    return res.json({
      success: true,
      data: {
        ...team,
        jugadores: membersQuery.rows
      }
    });
  } catch (err) {
    console.error('Error en GET /teams/:id:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar equipo.' });
  }
});

/**
 * POST /api/v1/teams
 * Registra un nuevo equipo y asigna al usuario como capitán.
 */
router.post('/', requireAuth, async (req, res) => {
  const client = await db.getClient();
  try {
    const { nombre, deporte_id, descripcion, ciudad, logo } = req.body;

    if (!nombre || !deporte_id) {
      return res.status(400).json({ success: false, error: 'Nombre de equipo y disciplina deportiva son obligatorios.' });
    }

    const slug = nombre.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

    await client.query('BEGIN');

    const insertTeam = `
      INSERT INTO teams (nombre, slug, descripcion, deporte_id, creador_id, logo, ciudad, estado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'activo')
      RETURNING *
    `;

    const tRes = await client.query(insertTeam, [
      nombre.trim(),
      slug,
      descripcion || null,
      deporte_id,
      req.user.id,
      logo || null,
      ciudad || req.user.ciudad || 'Cartago'
    ]);

    const newTeam = tRes.rows[0];

    // Asignar capitán
    await client.query(
      `INSERT INTO team_members (team_id, user_id, rol)
       VALUES ($1, $2, 'capitán')`,
      [newTeam.id, req.user.id]
    );

    await client.query('COMMIT');

    return res.status(201).json({ success: true, message: 'Equipo fundado exitosamente.', data: newTeam });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en POST /teams:', err);
    return res.status(500).json({ success: false, error: 'Error al crear equipo.' });
  } finally {
    client.release();
  }
});

module.exports = router;
