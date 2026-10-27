/**
 * LIMITLESS BACKEND — SERVICIO DE TIEMPO REAL (NEON REALTIME)
 * ==============================================================================
 * Gestiona la configuracion de WebSockets y canales en vivo para
 * marcadores de torneos, juntes, chat y notificaciones instantaneas.
 * ==============================================================================
 */

const realtimeUrl = process.env.NEON_REALTIME_URL;
const realtimeSecret = process.env.NEON_REALTIME_SECRET;

const SUPPORTED_CHANNELS = [
  'meetups:live',
  'tournaments:scores',
  'chat:direct',
  'notifications:user'
];

/**
 * Obtiene la configuracion publica para clientes de WebSocket
 */
function getRealtimeConfig() {
  return {
    provider: 'Neon Realtime',
    websocketUrl: realtimeUrl,
    supportedChannels: SUPPORTED_CHANNELS,
    enabled: Boolean(realtimeUrl)
  };
}

/**
 * Diagnostica la accesibilidad del endpoint de Neon Realtime
 */
async function testRealtimeConnection() {
  if (!realtimeUrl) {
    return {
      connected: false,
      error: 'NEON_REALTIME_URL no esta configurada en las variables de entorno.'
    };
  }

  const start = Date.now();
  const httpUrl = realtimeUrl.replace('wss://', 'https://').replace('ws://', 'http://');

  try {
    // Al realizar un GET HTTP contra el endpoint WS de Neon, responde 400 Bad Request
    // indicando que el socket esta activo y a la espera del handshake Upgrade: websocket
    const res = await fetch(httpUrl);
    const latency = Date.now() - start;

    return {
      connected: res.status === 400 || res.ok,
      endpoint: realtimeUrl,
      httpProbeStatus: res.status,
      latencyMs: latency,
      channels: SUPPORTED_CHANNELS
    };
  } catch (err) {
    return {
      connected: false,
      endpoint: realtimeUrl,
      error: err.message
    };
  }
}

module.exports = {
  getRealtimeConfig,
  testRealtimeConnection,
  SUPPORTED_CHANNELS
};
