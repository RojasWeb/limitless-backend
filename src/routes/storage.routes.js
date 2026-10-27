/**
 * LIMITLESS BACKEND — RUTAS DE ALMACENAMIENTO DE OBJETOS (NEON S3 STORAGE)
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const storage = require('../services/storage');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/v1/storage/status
 * Estado y diagnostico de conexion con Neon Object Storage
 */
router.get('/status', async (req, res, next) => {
  try {
    const status = await storage.testStorageConnection();
    res.status(status.connected ? 200 : 503).json({
      success: status.connected,
      storage: status
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/storage/list
 * Lista los archivos contenidos en el bucket especificado (o 'assets' por defecto)
 */
router.get('/list', async (req, res, next) => {
  try {
    const bucket = req.query.bucket || storage.DEFAULT_BUCKET;
    const prefix = req.query.prefix || '';
    const maxKeys = parseInt(req.query.limit || '50', 10);

    const list = await storage.listObjects({ bucket, prefix, maxKeys });
    res.json({
      success: true,
      data: list
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/storage/file/:key(*)
 * Recupera y sirve un archivo del bucket
 */
router.get('/file/:key(*)', async (req, res, next) => {
  try {
    const key = req.params.key;
    const bucket = req.query.bucket || storage.DEFAULT_BUCKET;

    const file = await storage.getObject({ key, bucket });

    if (file.contentType) {
      res.setHeader('Content-Type', file.contentType);
    }
    if (file.contentLength) {
      res.setHeader('Content-Length', file.contentLength);
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(file.data);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({
        success: false,
        error: 'El archivo solicitado no existe en Neon Object Storage.'
      });
    }
    next(err);
  }
});

/**
 * POST /api/v1/storage/upload
 * Sube un archivo o payload al bucket
 */
router.post('/upload', async (req, res, next) => {
  try {
    const { key, content, contentType, isBase64, bucket } = req.body;

    if (!key || content === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Los campos "key" y "content" son obligatorios.'
      });
    }

    let bodyBuffer;
    if (isBase64) {
      bodyBuffer = Buffer.from(content, 'base64');
    } else if (typeof content === 'string') {
      bodyBuffer = Buffer.from(content, 'utf-8');
    } else {
      bodyBuffer = Buffer.from(JSON.stringify(content));
    }

    const uploadResult = await storage.uploadObject({
      key,
      body: bodyBuffer,
      contentType: contentType || 'application/octet-stream',
      bucket: bucket || storage.DEFAULT_BUCKET
    });

    res.status(201).json({
      success: true,
      message: 'Archivo subido exitosamente a Neon Object Storage',
      data: uploadResult
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/storage/file/:key(*)
 * Elimina un archivo del bucket
 */
router.delete('/file/:key(*)', requireAuth, async (req, res, next) => {
  try {
    const key = req.params.key;
    const bucket = req.query.bucket || storage.DEFAULT_BUCKET;

    const result = await storage.deleteObject({ key, bucket });
    res.json({
      success: true,
      message: 'Archivo eliminado correctamente.',
      data: result
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
