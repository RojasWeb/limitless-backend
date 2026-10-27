/**
 * LIMITLESS BACKEND — SERVICIO DE FUNCIONES SERVERLESS (NEON FUNCTIONS)
 * ==============================================================================
 * Invoca las funciones Serverless declaradas en neon.ts y ejecutadas
 * en el edge de Neon (por ejemplo la funcion 'hello').
 * ==============================================================================
 */

const helloBaseUrl = process.env.NEON_FUNCTION_HELLO_BASE_URL;

/**
 * Invoca la funcion Serverless 'hello'
 * @param {Object} [options]
 * @param {string} [options.path='']
 * @param {string} [options.method='GET']
 * @param {Object} [options.body]
 * @param {Object} [options.headers]
 */
async function invokeHello({ path = '', method = 'GET', body = null, headers = {} } = {}) {
  if (!helloBaseUrl) {
    throw new Error('NEON_FUNCTION_HELLO_BASE_URL no esta configurada en las variables de entorno.');
  }

  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  const url = `${helloBaseUrl}${cleanPath}`;
  const start = Date.now();

  const reqOptions = {
    method,
    headers: {
      'Accept': 'application/json, text/plain, */*',
      ...headers
    }
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    reqOptions.headers['Content-Type'] = 'application/json';
    reqOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const response = await fetch(url, reqOptions);
  const latency = Date.now() - start;
  const contentType = response.headers.get('content-type') || '';
  let data;

  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return {
    success: response.ok,
    status: response.status,
    statusText: response.statusText,
    latencyMs: latency,
    data
  };
}

/**
 * Diagnostico de disponibilidad de la funcion Hello
 */
async function testFunctionConnection() {
  const start = Date.now();
  try {
    const result = await invokeHello();
    return {
      connected: result.success,
      status: result.status,
      latencyMs: Date.now() - start,
      baseUrl: helloBaseUrl,
      response: result.data
    };
  } catch (err) {
    return {
      connected: false,
      baseUrl: helloBaseUrl,
      error: err.message
    };
  }
}

module.exports = {
  invokeHello,
  testFunctionConnection
};
