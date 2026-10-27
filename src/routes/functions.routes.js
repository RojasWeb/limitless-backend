/**
 * LIMITLESS BACKEND — RUTAS DE FUNCIONES SERVERLESS (NEON FUNCTIONS)
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const functionsService = require('../services/neon-functions');

/**
 * GET /api/v1/functions/status
 * Comprueba el estado de la infraestructura de Neon Functions
 */
router.get('/status', async (req, res, next) => {
  try {
    const status = await functionsService.testFunctionConnection();
    res.status(status.connected ? 200 : 503).json({
      success: status.connected,
      neonFunctions: status
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/functions/hello
 * Invoca la funcion Serverless Hello World en Neon
 */
router.get('/hello', async (req, res, next) => {
  try {
    const result = await functionsService.invokeHello();
    res.status(result.status || 200).json({
      success: result.success,
      function: 'hello',
      latencyMs: result.latencyMs,
      data: result.data
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/functions/hello
 * Invoca la funcion Serverless pasando parametros adicionales
 */
router.post('/hello', async (req, res, next) => {
  try {
    const result = await functionsService.invokeHello({
      method: 'POST',
      body: req.body
    });
    res.status(result.status || 200).json({
      success: result.success,
      function: 'hello',
      latencyMs: result.latencyMs,
      data: result.data
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
