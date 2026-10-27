/**
 * LIMITLESS BACKEND — RUTAS DE AUTENTICACION NEON (NEON AUTH)
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const neonAuth = require('../services/neon-auth');

/**
 * GET /api/v1/neon-auth/config
 * Devuelve la configuracion de Neon Auth para el frontend de LIMITLESS
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    auth: neonAuth.getPublicConfig()
  });
});

/**
 * GET /api/v1/neon-auth/jwks
 * Obtiene el conjunto de claves JWKS publicas para verificacion de firmas
 */
router.get('/jwks', async (req, res, next) => {
  try {
    const jwks = await neonAuth.getJwksKeys(req.query.refresh === 'true');
    res.json({
      success: true,
      jwks
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/neon-auth/status
 * Diagnostica la disponibilidad y conectividad del servicio Neon Auth
 */
router.get('/status', async (req, res, next) => {
  try {
    const status = await neonAuth.testAuthConnection();
    res.status(status.connected ? 200 : 503).json({
      success: status.connected,
      neonAuth: status
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
