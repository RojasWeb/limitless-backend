/**
 * LIMITLESS BACKEND — SERVICIO DE AUTENTICACION NEON (NEON AUTH)
 * ==============================================================================
 * Gestiona la integracion con Neon Auth, recuperando las claves publicas JWKS
 * para validacion de tokens y exponiendo la configuracion de cliente.
 * ==============================================================================
 */

const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
const jwksUrl = process.env.NEON_AUTH_JWKS_URL;

let cachedJwks = null;
let lastJwksFetch = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora de cache

/**
 * Obtiene el conjunto de claves publicas JWKS de Neon Auth
 * @param {boolean} [forceRefresh=false]
 */
async function getJwksKeys(forceRefresh = false) {
  if (!jwksUrl) {
    throw new Error('NEON_AUTH_JWKS_URL no esta configurada en las variables de entorno.');
  }

  const now = Date.now();
  if (!forceRefresh && cachedJwks && (now - lastJwksFetch < CACHE_TTL_MS)) {
    return cachedJwks;
  }

  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new Error(`Error al consultar JWKS (${response.status}): ${response.statusText}`);
  }

  cachedJwks = await response.json();
  lastJwksFetch = now;
  return cachedJwks;
}

/**
 * Obtiene la configuracion publica para clientes frontend
 */
function getPublicConfig() {
  return {
    provider: 'Neon Auth',
    baseUrl: authBaseUrl,
    jwksUrl: jwksUrl,
    enabled: Boolean(authBaseUrl && jwksUrl)
  };
}

/**
 * Diagnostica la conexion hacia Neon Auth
 */
async function testAuthConnection() {
  const start = Date.now();
  try {
    const keys = await getJwksKeys(true);
    return {
      connected: true,
      baseUrl: authBaseUrl,
      jwksUrl: jwksUrl,
      latencyMs: Date.now() - start,
      activeKeysCount: (keys && keys.keys) ? keys.keys.length : 0
    };
  } catch (err) {
    return {
      connected: false,
      baseUrl: authBaseUrl,
      jwksUrl: jwksUrl,
      error: err.message
    };
  }
}

module.exports = {
  getJwksKeys,
  getPublicConfig,
  testAuthConnection
};
