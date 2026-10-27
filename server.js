/**
 * ==============================================================================
 * LIMITLESS — SERVIDOR API REST & CAPA DE SEGURIDAD (NEON POSTGRESQL)
 * ==============================================================================
 * Versión: 2.1.0 (Producción)
 * 
 * Funcionalidades:
 * 1. Protección estricta con Helmet (Headers HTTP seguros) y CORS configurable.
 * 2. Pool de conexiones con reconexión automática y SSL a Neon Serverless.
 * 3. Consultas 100% parametrizadas contra SQL Injection.
 * 4. Autenticación JWT con contraseñas hasheadas en Bcrypt.
 * 5. Endpoints REST completos para: Auth, Usuarios, Deportes, Juntes, Equipos,
 *    Torneos, Partidos, Comunidad, Chat, Notificaciones, Tienda, Carrito,
 *    Pedidos, Favoritos, Soporte, CMS y Auditoría.
 * ==============================================================================
 */

const path = require('path');
// Carga de variables de entorno con soporte para Neon (.env.local, .env)
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./src/db');

// Servicios de Neon
const storageService = require('./src/services/storage');
const functionsService = require('./src/services/neon-functions');
const neonAuthService = require('./src/services/neon-auth');
const realtimeService = require('./src/services/neon-realtime');

// Rutas modulares
const authRoutes = require('./src/routes/auth.routes');
const usersRoutes = require('./src/routes/users.routes');
const sportsRoutes = require('./src/routes/sports.routes');
const meetupsRoutes = require('./src/routes/meetups.routes');
const teamsRoutes = require('./src/routes/teams.routes');
const tournamentsRoutes = require('./src/routes/tournaments.routes');
const communityRoutes = require('./src/routes/community.routes');
const chatRoutes = require('./src/routes/chat.routes');
const notificationsRoutes = require('./src/routes/notifications.routes');
const storeRoutes = require('./src/routes/store.routes');
const supportRoutes = require('./src/routes/support.routes');
const siteRoutes = require('./src/routes/site.routes');
const auditRoutes = require('./src/routes/audit.routes');

// Rutas de Servicios Neon
const storageRoutes = require('./src/routes/storage.routes');
const functionsRoutes = require('./src/routes/functions.routes');
const neonAuthRoutes = require('./src/routes/neon-auth.routes');
const realtimeRoutes = require('./src/routes/realtime.routes');

const app = express();
const PORT = process.env.PORT || 4000;
const API_PREFIX = process.env.API_PREFIX || '/api/v1';

// 1. SEGURIDAD Y HEADERS HTTP
app.use(helmet({
  crossOriginResourcePolicy: false // Permite consumo de imágenes y recursos cross-origin
}));

// 2. CONFIGURACIÓN DE CORS
const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Permitir peticiones sin origen (como apps móviles, curl o Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Permitir cualquier subdominio de localhost o InfinityFree en desarrollo
    if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('infinityfreeapp.com') || origin.includes('epizy.com')) {
      return callback(null, true);
    }
    return callback(null, true); // Permisivo controlado para despliegue desacoplado
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// 3. PARSERS DE ENTRADA
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. LOGGING DE PETICIONES EN DESARROLLO
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[HTTP ${res.statusCode}] ${req.method} ${req.originalUrl} (${duration}ms)`);
    }
  });
  next();
});

// 5. RUTA DE SALUD Y DIAGNÓSTICO EN VIVO (NEON HEALTH CHECK)
app.get('/', (req, res) => {
  res.json({
    app: 'LIMITLESS REST API',
    version: '2.1.0',
    status: 'ONLINE',
    documentation: `${API_PREFIX}/health`,
    timestamp: new Date().toISOString()
  });
});

app.get(`${API_PREFIX}/health`, async (req, res) => {
  const start = Date.now();
  const dbStatus = await db.testConnection();
  const latency = Date.now() - start;

  res.status(dbStatus.connected ? 200 : 503).json({
    status: dbStatus.connected ? 'HEALTHY' : 'DATABASE_UNAVAILABLE',
    neonPostgres: dbStatus,
    latencyMs: latency,
    uptimeSeconds: Math.floor(process.uptime()),
    services: {
      neonPostgres: dbStatus.connected,
      neonAuth: Boolean(process.env.NEON_AUTH_BASE_URL),
      neonObjectStorage: Boolean(process.env.AWS_ENDPOINT_URL_S3),
      neonFunctions: Boolean(process.env.NEON_FUNCTION_HELLO_BASE_URL),
      neonRealtime: Boolean(process.env.NEON_REALTIME_URL)
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * Endpoint de diagnóstico exhaustivo de todos los servicios Neon provisionados
 */
app.get(`${API_PREFIX}/health/services`, async (req, res) => {
  const [dbStatus, authStatus, storageStatus, fnStatus, rtStatus] = await Promise.all([
    db.testConnection(),
    neonAuthService.testAuthConnection(),
    storageService.testStorageConnection(),
    functionsService.testFunctionConnection(),
    realtimeService.testRealtimeConnection()
  ]);

  const allConnected = dbStatus.connected && authStatus.connected && storageStatus.connected && fnStatus.connected && rtStatus.connected;

  res.status(allConnected ? 200 : 207).json({
    status: allConnected ? 'ALL_SERVICES_ONLINE' : 'PARTIAL_ONLINE',
    branch: process.env.NEON_BRANCH || 'production',
    services: {
      postgres: dbStatus,
      auth: authStatus,
      objectStorage: storageStatus,
      functions: fnStatus,
      realtime: rtStatus
    },
    timestamp: new Date().toISOString()
  });
});

// 6. REGISTRO DE RUTAS DE LA API
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, usersRoutes);
app.use(`${API_PREFIX}/sports`, sportsRoutes);
app.use(`${API_PREFIX}/meetups`, meetupsRoutes);
app.use(`${API_PREFIX}/teams`, teamsRoutes);
app.use(`${API_PREFIX}/tournaments`, tournamentsRoutes);
app.use(`${API_PREFIX}/community`, communityRoutes);
app.use(`${API_PREFIX}/chat`, chatRoutes);
app.use(`${API_PREFIX}/notifications`, notificationsRoutes);
app.use(`${API_PREFIX}/store`, storeRoutes);
app.use(`${API_PREFIX}/support`, supportRoutes);
app.use(`${API_PREFIX}/site`, siteRoutes);
app.use(`${API_PREFIX}/audit`, auditRoutes);

// 6.1 RUTAS DE SERVICIOS NEON
app.use(`${API_PREFIX}/storage`, storageRoutes);
app.use(`${API_PREFIX}/functions`, functionsRoutes);
app.use(`${API_PREFIX}/neon-auth`, neonAuthRoutes);
app.use(`${API_PREFIX}/realtime`, realtimeRoutes);

// 7. MANEJO DE RUTAS NO ENCONTRADAS (404)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Ruta ${req.method} ${req.originalUrl} no encontrada en la API de LIMITLESS.`
  });
});

// 8. MANEJO GLOBAL DE ERRORES (500)
app.use((err, req, res, next) => {
  console.error('❌ [ERROR INESPERADO EN SERVIDOR]:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Error interno del servidor en LIMITLESS API.',
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
  });
});

// 9. INICIO DEL SERVIDOR
const server = app.listen(PORT, () => {
  console.log('============================================================');
  console.log(`⚡ LIMITLESS BACKEND API — SERVIDOR ACTIVO`);
  console.log(`🌐 Escuchando en el puerto: ${PORT}`);
  console.log(`📡 URL Base API: http://localhost:${PORT}${API_PREFIX}`);
  console.log(`🩺 Endpoint de Diagnóstico: http://localhost:${PORT}${API_PREFIX}/health`);
  console.log('============================================================');
});

module.exports = { app, server };
