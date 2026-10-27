/**
 * LIMITLESS BACKEND — RUTAS DE JUNTES DEPORTIVOS (MEETUPS)
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

/**
 * GET /api/v1/meetups
 * Consulta encuentros deportivos con filtros por deporte, ciudad y nivel.
 * Incluye disponibilidad y estado de si el usuario en sesión ya está unido.
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { sport, city, level } = req.query;
    let queryStr = `
      SELECT 
        v.*,
        m.descripcion,
        s.slug as deporte_slug,
        ${req.user ? `EXISTS(SELECT 1 FROM meetup_participants WHERE meetup_id = v.meetup_id AND user_id = $1 AND estado = 'aceptado')` : 'false'} AS unido
      FROM vw_meetup_availability v
      JOIN meetups m ON v.meetup_id = m.id
      JOIN sports s ON v.deporte_id = s.id
      WHERE 1=1
    `;
    const params = [];
    if (req.user) params.push(req.user.id);

    if (sport && sport !== 'all') {
      params.push(sport.toLowerCase());
      queryStr += ` AND s.slug = $${params.length}`;
    }

    if (city && city !== 'all') {
      params.push(`%${city}%`);
      queryStr += ` AND v.ciudad ILIKE $${params.length}`;
    }

    if (level && level !== 'all') {
      params.push(level);
      queryStr += ` AND v.nivel = $${params.length}`;
    }

    queryStr += ` ORDER BY v.fecha ASC, v.hora_inicio ASC`;

    const { rows } = await db.query(queryStr, params);

    // Mapeo amigable para el frontend de LIMITLESS
    const mapped = rows.map(r => {
      const creatorName = `${r.creador_nombre || ''} ${r.creador_apellido || ''}`.trim() || 'Organizador';
      const creatorAvatar = r.creador_foto || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';
      const meetupImg = r.imagen || r.deporte_imagen || r.imagen_url || 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=800&q=80';

      return {
        id: String(r.meetup_id),
        titulo: r.titulo,
        deporte: r.deporte_slug,
        deporteNombre: r.deporte_nombre,
        icono: r.deporte_icono,
        imagen: meetupImg,
        imagen_url: meetupImg,
        fecha: r.fecha instanceof Date ? r.fecha.toISOString().split('T')[0] : String(r.fecha),
        hora: String(r.hora_inicio).slice(0, 5),
        lugar: r.ubicacion,
        ciudad: r.ciudad,
        nivel: r.nivel,
        cupoMax: r.maximo_participantes,
        cupoActual: parseInt(r.participantes_actuales, 10),
        cuposDisponibles: parseInt(r.cupos_disponibles, 10),
        estado: r.estado_calculado,
        unido: Boolean(r.unido),
        organizador: creatorName,
        organizadorAvatar: creatorAvatar,
        creador: {
          id: r.creador_id,
          nombre: creatorName,
          avatar: creatorAvatar
        },
        descripcion: r.descripcion
      };
    });

    return res.json({ success: true, count: mapped.length, data: mapped });
  } catch (err) {
    console.error('Error en GET /meetups:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar juntes deportivos.' });
  }
});

/**
 * GET /api/v1/meetups/:id
 * Detalle completo de un junte con su lista de participantes aceptados.
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const meetupId = parseInt(req.params.id, 10);
    const { rows } = await db.query(
      `SELECT v.*, m.descripcion, s.slug as deporte_slug
       FROM vw_meetup_availability v
       JOIN meetups m ON v.meetup_id = m.id
       JOIN sports s ON v.deporte_id = s.id
       WHERE v.meetup_id = $1`,
      [meetupId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Junte deportivo no encontrado.' });
    }

    const meetup = rows[0];

    // Participantes
    const partQuery = await db.query(
      `SELECT mp.id, mp.user_id, mp.estado, mp.fecha_union,
              u.nombre, u.apellido, u.username, u.foto_perfil, u.ciudad
       FROM meetup_participants mp
       JOIN users u ON mp.user_id = u.id
       WHERE mp.meetup_id = $1 AND mp.estado = 'aceptado'
       ORDER BY mp.fecha_union ASC`,
      [meetupId]
    );

    return res.json({
      success: true,
      data: {
        ...meetup,
        participantes: partQuery.rows
      }
    });
  } catch (err) {
    console.error('Error en GET /meetups/:id:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar junte.' });
  }
});

/**
 * POST /api/v1/meetups
 * Convoca un nuevo junte deportivo y añade automáticamente al creador.
 */
router.post('/', requireAuth, async (req, res) => {
  const client = await db.getClient();
  try {
    const { deporte, deporte_id, titulo, descripcion, fecha, hora, lugar, ciudad, nivel, cupoMax, imagen_url, imagen } = req.body;

    if (!titulo || !fecha || !hora || !lugar) {
      return res.status(400).json({
        success: false,
        error: 'Título, fecha, hora y lugar son campos obligatorios.'
      });
    }

    await client.query('BEGIN');

    let resolvedSportId = deporte_id;
    if (!resolvedSportId && deporte) {
      const sRes = await client.query('SELECT id FROM sports WHERE slug = $1', [deporte.toLowerCase()]);
      if (sRes.rows.length > 0) resolvedSportId = sRes.rows[0].id;
    }
    if (!resolvedSportId) resolvedSportId = 1;

    const insertMeetup = `
      INSERT INTO meetups (
        creador_id, deporte_id, titulo, descripcion, fecha, hora_inicio, ubicacion, ciudad, nivel, maximo_participantes, imagen_url, estado
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'abierto')
      RETURNING *
    `;

    const formattedHora = hora.length === 5 ? `${hora}:00` : hora;
    const maxPart = parseInt(cupoMax, 10) || 10;
    const resolvedImgUrl = (imagen_url || imagen || '').trim() || null;

    const mRes = await client.query(insertMeetup, [
      req.user.id,
      resolvedSportId,
      titulo.trim(),
      descripcion || 'Convocatoria oficial creada desde LIMITLESS.',
      fecha,
      formattedHora,
      lugar.trim(),
      ciudad ? ciudad.trim() : (req.user.ciudad || 'Cartago'),
      nivel || 'Todos los niveles',
      maxPart,
      resolvedImgUrl
    ]);

    const newMeetup = mRes.rows[0];

    await client.query(
      `INSERT INTO meetup_participants (meetup_id, user_id, estado)
       VALUES ($1, $2, 'aceptado')
       ON CONFLICT (meetup_id, user_id) DO NOTHING`,
      [newMeetup.id, req.user.id]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: '¡Junte deportivo convocado exitosamente!',
      data: newMeetup
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en POST /meetups:', err);
    return res.status(500).json({ success: false, error: err.message || 'Error al crear el junte.' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/meetups/:id/join
 * Alterna la participación del usuario en el junte (Unirse / Salirse).
 */
router.post('/:id/join', requireAuth, async (req, res) => {
  try {
    const meetupId = parseInt(req.params.id, 10);

    const existing = await db.query(
      'SELECT id, estado FROM meetup_participants WHERE meetup_id = $1 AND user_id = $2',
      [meetupId, req.user.id]
    );

    if (existing.rows.length > 0) {
      await db.query('DELETE FROM meetup_participants WHERE id = $1', [existing.rows[0].id]);
      await db.query(
        `UPDATE meetups SET estado = 'abierto' WHERE id = $1 AND estado = 'lleno'`,
        [meetupId]
      );

      return res.json({
        success: true,
        joined: false,
        message: 'Has liberado tu cupo en este junte deportivo.'
      });
    } else {
      await db.query(
        `INSERT INTO meetup_participants (meetup_id, user_id, estado)
         VALUES ($1, $2, 'aceptado')`,
        [meetupId, req.user.id]
      );

      return res.json({
        success: true,
        joined: true,
        message: '¡Te has unido exitosamente al junte deportivo!'
      });
    }
  } catch (err) {
    console.error('Error en POST /meetups/:id/join:', err);
    if (err.message && err.message.includes('capacidad máxima')) {
      return res.status(409).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: 'Error al procesar la unión al junte.' });
  }
});

module.exports = router;
