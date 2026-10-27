/**
 * LIMITLESS BACKEND — RUTAS DE TIEMPO REAL (NEON REALTIME)
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const realtimeService = require('../services/neon-realtime');

/**
 * GET /api/v1/realtime/config
 * Retorna configuracion de canales y WebSocket URL para el cliente
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    realtime: realtimeService.getRealtimeConfig()
  });
});

/**
 * GET /api/v1/realtime/status
 * Diagnostica la accesibilidad del endpoint de Neon Realtime
 */
router.get('/status', async (req, res, next) => {
  try {
    const status = await realtimeService.testRealtimeConnection();
    res.status(status.connected ? 200 : 503).json({
      success: status.connected,
      neonRealtime: status
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
