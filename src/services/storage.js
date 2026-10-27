/**
 * LIMITLESS BACKEND — SERVICIO DE ALMACENAMIENTO DE OBJETOS (NEON OBJECT STORAGE)
 * ==============================================================================
 * Interactúa con los buckets S3-compatibles declarados en Neon (assets, uploads)
 * utilizando el SDK oficial @aws-sdk/client-s3.
 * ==============================================================================
 */

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand
} = require('@aws-sdk/client-s3');

const region = process.env.AWS_REGION || 'us-east-2';
const endpoint = process.env.AWS_ENDPOINT_URL_S3;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const DEFAULT_BUCKET = process.env.NEON_STORAGE_BUCKET || 'assets';

let s3ClientInstance = null;

function getS3Client() {
  if (!s3ClientInstance) {
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      console.warn('⚠️ [STORAGE WARNING] Credenciales de Neon Object Storage incompletas en variables de entorno.');
    }
    s3ClientInstance = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || ''
      },
      forcePathStyle: true // Requerido para endpoints S3 compatibles como Neon Storage
    });
  }
  return s3ClientInstance;
}

/**
 * Sube un archivo u objeto al bucket de Neon
 * @param {Object} options
 * @param {string} options.key - Ruta / nombre del archivo en el bucket
 * @param {Buffer|string|Uint8Array} options.body - Contenido del archivo
 * @param {string} [options.contentType='application/octet-stream']
 * @param {string} [options.bucket='assets']
 * @returns {Promise<Object>}
 */
async function uploadObject({ key, body, contentType = 'application/octet-stream', bucket = DEFAULT_BUCKET }) {
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType
  });

  const response = await client.send(command);
  return {
    success: true,
    bucket,
    key,
    etag: response.ETag,
    versionId: response.VersionId
  };
}

/**
 * Obtiene un objeto y su contenido desde el bucket
 * @param {Object} options
 * @param {string} options.key
 * @param {string} [options.bucket='assets']
 * @returns {Promise<{ body: Buffer, contentType: string, contentLength: number }>}
 */
async function getObject({ key, bucket = DEFAULT_BUCKET }) {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });

  const response = await client.send(command);
  const byteArray = await response.Body.transformToByteArray();
  const buffer = Buffer.from(byteArray);

  return {
    success: true,
    key,
    bucket,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
    lastModified: response.LastModified,
    data: buffer
  };
}

/**
 * Elimina un objeto del bucket
 * @param {Object} options
 * @param {string} options.key
 * @param {string} [options.bucket='assets']
 */
async function deleteObject({ key, bucket = DEFAULT_BUCKET }) {
  const client = getS3Client();
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key
  });

  const response = await client.send(command);
  return {
    success: true,
    bucket,
    key,
    response
  };
}

/**
 * Lista objetos en un bucket
 * @param {Object} options
 * @param {string} [options.bucket='assets']
 * @param {string} [options.prefix='']
 * @param {number} [options.maxKeys=50]
 */
async function listObjects({ bucket = DEFAULT_BUCKET, prefix = '', maxKeys = 50 } = {}) {
  const client = getS3Client();
  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
    MaxKeys: maxKeys
  });

  const response = await client.send(command);
  const items = (response.Contents || []).map(item => ({
    key: item.Key,
    size: item.Size,
    lastModified: item.LastModified,
    etag: item.ETag
  }));

  return {
    bucket,
    prefix,
    count: items.length,
    isTruncated: response.IsTruncated,
    items
  };
}

/**
 * Prueba la conexion activa al almacenamiento de objetos de Neon
 */
async function testStorageConnection() {
  const start = Date.now();
  const testKey = `diagnostics/probe-${Date.now()}.txt`;
  const testData = `Neon Object Storage Health Probe - ${new Date().toISOString()}`;

  try {
    // 1. Escribir archivo de prueba
    await uploadObject({
      key: testKey,
      body: testData,
      contentType: 'text/plain',
      bucket: DEFAULT_BUCKET
    });

    // 2. Leer archivo de prueba
    const retrieved = await getObject({
      key: testKey,
      bucket: DEFAULT_BUCKET
    });

    const matches = retrieved.data.toString() === testData;

    // 3. Limpiar archivo de prueba
    await deleteObject({
      key: testKey,
      bucket: DEFAULT_BUCKET
    });

    const latency = Date.now() - start;

    return {
      connected: true,
      bucket: DEFAULT_BUCKET,
      endpoint,
      latencyMs: latency,
      integrityVerified: matches
    };
  } catch (err) {
    return {
      connected: false,
      bucket: DEFAULT_BUCKET,
      endpoint,
      error: err.message
    };
  }
}

module.exports = {
  getS3Client,
  uploadObject,
  getObject,
  deleteObject,
  listObjects,
  testStorageConnection,
  DEFAULT_BUCKET
};
