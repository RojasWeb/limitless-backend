/**
 * LIMITLESS BACKEND — RUTAS DE CONFIGURACIÓN Y CONTENIDO CMS
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/v1/site/settings
 * Retorna las variables y ajustes maestros de la plataforma.
 */
router.get('/settings', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT clave, valor, tipo, descripcion FROM site_settings');
    const settingsObj = {};
    rows.forEach(r => {
      let val = r.valor;
      if (r.tipo === 'number') val = Number(r.valor);
      if (r.tipo === 'boolean') val = r.valor === 'true';
      if (r.tipo === 'json') {
        try { val = JSON.parse(r.valor); } catch(_) {}
      }
      settingsObj[r.clave] = val;
    });

    return res.json({ success: true, data: settingsObj });
  } catch (err) {
    console.error('Error en GET /site/settings:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar configuración del sitio.' });
  }
});

/**
 * GET /api/v1/site/content/:seccion
 * Retorna los textos dinámicos editoriales de una sección (ej. manifiesto, faq, reglas).
 */
router.get('/content/:seccion', async (req, res) => {
  try {
    const { seccion } = req.params;
    const { rows } = await db.query(
      'SELECT clave, contenido, idioma FROM site_content WHERE seccion = $1',
      [seccion.toLowerCase()]
    );

    const contentMap = {};
    rows.forEach(r => {
      contentMap[r.clave] = r.contenido;
    });

    return res.json({ success: true, seccion, data: contentMap });
  } catch (err) {
    console.error('Error en GET /site/content/:seccion:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar contenidos del sitio.' });
  }
});

module.exports = router;
