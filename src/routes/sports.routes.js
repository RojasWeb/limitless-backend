/**
 * LIMITLESS BACKEND — RUTAS DE DEPORTES
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/v1/sports
 * Retorna el catálogo completo de disciplinas deportivas activas en LIMITLESS.
 */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, nombre, slug, descripcion, imagen, icono, tagline, coordenadas_referencia, ciudad_referencia, estado
       FROM sports 
       WHERE estado = 'activo'
       ORDER BY id ASC`
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error en GET /sports:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar deportes.' });
  }
});

/**
 * GET /api/v1/sports/:slug
 * Retorna la información de un deporte por su slug (ej. basketball, futbol, volleyball, running).
 */
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { rows } = await db.query(
      `SELECT id, nombre, slug, descripcion, imagen, icono, tagline, coordenadas_referencia, ciudad_referencia
       FROM sports 
       WHERE slug = $1 AND estado = 'activo'`,
      [slug.toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Deporte no encontrado.' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Error en GET /sports/:slug:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar deporte.' });
  }
});

module.exports = router;
