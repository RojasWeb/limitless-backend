/**
 * LIMITLESS BACKEND — RUTAS DE TORNEOS Y PARTIDOS
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

/**
 * GET /api/v1/tournaments
 * Calendario oficial de torneos competitivos de LIMITLESS.
 */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT t.*, s.nombre as deporte_nombre, s.slug as deporte_slug,
              (SELECT COUNT(*) FROM tournament_registrations tr WHERE tr.tournament_id = t.id AND tr.estado = 'confirmada') as total_inscritos
       FROM tournaments t
       JOIN sports s ON t.deporte_id = s.id
       ORDER BY t.fecha_inicio ASC`
    );

    const mapped = rows.map(t => {
      const spotsLeft = Math.max(0, t.maximo_equipos - parseInt(t.total_inscritos, 10));
      return {
        id: String(t.id),
        name: t.nombre,
        slug: t.slug,
        sport: t.deporte_slug,
        sportLabel: t.deporte_nombre.toUpperCase(),
        date: t.fecha_inicio instanceof Date ? t.fecha_inicio.toISOString().split('T')[0] : String(t.fecha_inicio),
        location: `${t.ubicacion}, ${t.ciudad}`,
        teams: `${t.maximo_equipos} EQUIPOS`,
        players: `${spotsLeft} CUPOS DISPONIBLES`,
        prize: t.premio_descripcion || '$ 3.500.000 COP',
        status: t.estado === 'inscripciones_abiertas' ? 'INSCRIPCIONES ABIERTAS' : t.estado.toUpperCase(),
        spotsLeft: `${spotsLeft} EQUIPOS`,
        desc: t.descripcion,
        image: t.imagen,
        priceFormatted: `$ ${Number(t.precio_inscripcion).toLocaleString('es-CO')} COP`
      };
    });

    return res.json({ success: true, count: mapped.length, data: mapped });
  } catch (err) {
    console.error('Error en GET /tournaments:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar torneos.' });
  }
});

/**
 * GET /api/v1/tournaments/:slug
 * Ficha detallada de un torneo por su slug.
 */
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { rows } = await db.query(
      `SELECT t.*, s.nombre as deporte_nombre, s.slug as deporte_slug
       FROM tournaments t
       JOIN sports s ON t.deporte_id = s.id
       WHERE t.slug = $1`,
      [slug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Torneo no encontrado.' });
    }

    const tournament = rows[0];

    // Partidos programados
    const matchesQuery = await db.query(
      `SELECT m.*, el.nombre as local_nombre, ev.nombre as visitante_nombre
       FROM matches m
       LEFT JOIN teams el ON m.equipo_local_id = el.id
       LEFT JOIN teams ev ON m.equipo_visitante_id = ev.id
       WHERE m.tournament_id = $1
       ORDER BY m.fecha ASC, m.hora ASC`,
      [tournament.id]
    );

    return res.json({
      success: true,
      data: {
        ...tournament,
        partidos: matchesQuery.rows
      }
    });
  } catch (err) {
    console.error('Error en GET /tournaments/:slug:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar torneo.' });
  }
});

/**
 * POST /api/v1/tournaments/:id/register
 * Preinscripción de un equipo o deportista a un torneo oficial.
 */
router.post('/:id/register', requireAuth, async (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id, 10);
    const { teamName, team_id, phone, email } = req.body;

    if (!teamName || !phone || !email) {
      return res.status(400).json({
        success: false,
        error: 'Nombre de equipo, teléfono y correo de contacto son obligatorios.'
      });
    }

    const insertQuery = `
      INSERT INTO tournament_registrations (
        tournament_id, team_id, user_id, nombre_registro, telefono_contacto, email_contacto, estado, estado_pago
      ) VALUES ($1, $2, $3, $4, $5, $6, 'confirmada', 'pendiente')
      RETURNING *
    `;

    const { rows } = await db.query(insertQuery, [
      tournamentId,
      team_id || null,
      req.user.id,
      teamName.trim(),
      phone.trim(),
      email.trim()
    ]);

    return res.status(201).json({
      success: true,
      message: `¡Inscripción para "${teamName}" registrada exitosamente! Revisa tu correo para el fixture y pago.`,
      data: rows[0]
    });
  } catch (err) {
    console.error('Error en POST /tournaments/:id/register:', err);
    return res.status(500).json({ success: false, error: 'Error al registrar la inscripción al torneo.' });
  }
});

module.exports = router;
