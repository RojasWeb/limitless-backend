/**
 * LIMITLESS BACKEND — RUTAS DE COMUNIDAD Y RED SOCIAL
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

/**
 * GET /api/v1/community/feed
 * Feed social de publicaciones de cancha con recuento de likes y fotos.
 */
router.get('/feed', optionalAuth, async (req, res) => {
  try {
    const query = `
      SELECT 
        p.*,
        u.nombre as author_nombre,
        u.apellido as author_apellido,
        u.username as author_username,
        u.foto_perfil as author_avatar,
        s.slug as sport_slug,
        s.nombre as sport_nombre,
        ${req.user ? `EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1)` : 'false'} AS liked
      FROM community_posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN sports s ON p.sport_id = s.id
      WHERE p.estado = 'activo'
      ORDER BY p.fecha_creacion DESC
    `;

    const params = req.user ? [req.user.id] : [];
    const { rows } = await db.query(query, params);

    const mapped = rows.map(p => ({
      id: String(p.id),
      author: `${p.author_nombre} ${p.author_apellido || ''}`.trim(),
      handle: p.author_username ? `@${p.author_username}` : '@atleta',
      avatar: p.author_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
      sport: p.sport_slug || 'basketball',
      sportLabel: p.sport_nombre || 'BASKETBALL',
      city: p.ciudad,
      timeAgo: 'Reciente',
      content: p.contenido,
      image: p.imagen_url,
      likes: parseInt(p.likes_count, 10) || 0,
      comments: parseInt(p.comments_count, 10) || 0,
      liked: Boolean(p.liked)
    }));

    return res.json({ success: true, count: mapped.length, data: mapped });
  } catch (err) {
    console.error('Error en GET /community/feed:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar feed social.' });
  }
});

/**
 * POST /api/v1/community/posts
 * Publica una foto o actualización de cancha en el feed.
 */
router.post('/posts', requireAuth, async (req, res) => {
  try {
    const { content, sportSlug, imageUrl } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'El contenido del post no puede estar vacío.' });
    }

    let sportId = 1;
    if (sportSlug) {
      const sRes = await db.query('SELECT id FROM sports WHERE slug = $1', [sportSlug.toLowerCase()]);
      if (sRes.rows.length > 0) sportId = sRes.rows[0].id;
    }

    const insertQuery = `
      INSERT INTO community_posts (user_id, sport_id, contenido, imagen_url, ciudad, estado)
      VALUES ($1, $2, $3, $4, $5, 'activo')
      RETURNING *
    `;

    const { rows } = await db.query(insertQuery, [
      req.user.id,
      sportId,
      content.trim(),
      imageUrl || null,
      req.user.ciudad || 'Cartago'
    ]);

    return res.status(201).json({
      success: true,
      message: '¡Publicación compartida con la comunidad!',
      data: rows[0]
    });
  } catch (err) {
    console.error('Error en POST /community/posts:', err);
    return res.status(500).json({ success: false, error: 'Error al publicar en la comunidad.' });
  }
});

/**
 * POST /api/v1/community/posts/:id/like
 * Alterna el like de un deportista en una publicación.
 */
router.post('/posts/:id/like', requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id, 10);

    const existing = await db.query(
      'SELECT id FROM post_likes WHERE post_id = $1 AND user_id = $2',
      [postId, req.user.id]
    );

    if (existing.rows.length > 0) {
      // Quitar like
      await db.query('DELETE FROM post_likes WHERE id = $1', [existing.rows[0].id]);
      await db.query('UPDATE community_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = $1', [postId]);
      return res.json({ success: true, liked: false });
    } else {
      // Agregar like
      await db.query('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)', [postId, req.user.id]);
      await db.query('UPDATE community_posts SET likes_count = likes_count + 1 WHERE id = $1', [postId]);
      return res.json({ success: true, liked: true });
    }
  } catch (err) {
    console.error('Error en POST /community/posts/:id/like:', err);
    return res.status(500).json({ success: false, error: 'Error al registrar reacción.' });
  }
});

/**
 * GET /api/v1/community/groups
 * Grupos regionales temáticos.
 */
router.get('/groups', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT g.*, s.nombre as deporte_nombre,
              (SELECT COUNT(*) FROM community_group_members gm WHERE gm.group_id = g.id) as total_miembros
       FROM community_groups g
       LEFT JOIN sports s ON g.deporte_id = s.id
       ORDER BY g.id ASC`
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error en GET /community/groups:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar grupos.' });
  }
});

module.exports = router;
