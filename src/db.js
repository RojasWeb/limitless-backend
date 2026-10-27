/**
 * LIMITLESS BACKEND — MÓDULO DE CONEXIÓN A NEON POSTGRESQL
 * ==============================================================================
 * Gestiona el pool de conexiones seguras hacia la base de datos Serverless de Neon.
 * Todas las consultas son parametrizadas para proteger contra SQL Injection.
 * ==============================================================================
 */

const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('⚠️ [DB WARNING] DATABASE_URL no está definida en las variables de entorno (.env).');
}

// Configuración de conexión optimizada para Neon PostgreSQL
const pool = new Pool({
  connectionString,
  ssl: {
    // Neon requiere TLS/SSL para todas las conexiones entrantes
    rejectUnauthorized: false
  },
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_TIMEOUT_MS || '10000', 10),
  idleTimeoutMillis: 30000
});

pool.on('error', (err) => {
  console.error('❌ [NEON ERROR INESPERADO EN EL POOL]:', err.message);
});

/**
 * Ejecuta una consulta SQL parametrizada de manera segura.
 * @param {string} text - Sentencia SQL con marcadores $1, $2, etc.
 * @param {Array} params - Lista de parámetros a vincular.
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log(`⚡ [DB QUERY - ${duration}ms]:`, text.trim().slice(0, 100), `(params: ${params.length})`);
    }
    return res;
  } catch (error) {
    console.error('❌ [DB ERROR]:', error.message, '| SQL:', text.trim().slice(0, 120));
    throw error;
  }
}

/**
 * Obtiene un cliente dedicado del pool para transacciones (BEGIN, COMMIT, ROLLBACK).
 */
async function getClient() {
  const client = await pool.connect();
  const originalQuery = client.query;
  const originalRelease = client.release;

  // Timeout de seguridad para evitar transacciones colgadas
  const timeout = setTimeout(() => {
    console.error('⚠️ [DB WARNING]: Un cliente de transacción ha estado retenido por más de 5 segundos.');
  }, 5000);

  client.release = () => {
    clearTimeout(timeout);
    client.query = originalQuery;
    client.release = originalRelease;
    return originalRelease.apply(client);
  };

  return client;
}

/**
 * Comprueba el estado de la conexión contra Neon PostgreSQL.
 */
async function testConnection() {
  try {
    const res = await query('SELECT NOW() as now, version() as version, current_database() as db');
    return {
      connected: true,
      timestamp: res.rows[0].now,
      version: res.rows[0].version,
      database: res.rows[0].db
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message
    };
  }
}

module.exports = {
  pool,
  query,
  getClient,
  testConnection
};
