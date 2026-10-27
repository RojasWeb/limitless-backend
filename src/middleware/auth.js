/**
 * LIMITLESS BACKEND — MIDDLEWARES DE AUTENTICACIÓN Y AUTORIZACIÓN JWT
 * ==============================================================================
 */

const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_limitless_sports_2026_xyz987654321';

/**
 * Middleware para rutas estrictamente protegidas.
 * Rechaza la petición con 401 si no hay token válido.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Acceso no autorizado. Se requiere un token Bearer válido.'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verificar que el usuario aún exista y no esté bloqueado o eliminado
    const { rows } = await db.query(
      'SELECT id, nombre, apellido, username, email, ciudad, foto_perfil, rol, estado FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Usuario no encontrado o cuenta desactivada.' });
    }

    const user = rows[0];
    if (user.estado === 'bloqueado') {
      return res.status(403).json({ success: false, error: 'Esta cuenta ha sido suspendida por el administrador.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.' });
    }
    return res.status(401).json({ success: false, error: 'Token de autenticación inválido.' });
  }
}

/**
 * Middleware para rutas híbridas (públicas o autenticadas).
 * Si hay token lo valida y adjunta req.user; si no hay token, continúa con req.user = null.
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      const { rows } = await db.query(
        'SELECT id, nombre, apellido, username, email, ciudad, foto_perfil, rol, estado FROM users WHERE id = $1 AND deleted_at IS NULL',
        [decoded.id]
      );
      if (rows.length > 0 && rows[0].estado !== 'bloqueado') {
        req.user = rows[0];
      }
    }
  } catch (err) {
    // Silencioso: req.user permanece como null
    req.user = null;
  }
  next();
}

/**
 * Middleware para endpoints administrativos exclusivos.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.rol !== 'administrador') {
    return res.status(403).json({
      success: false,
      error: 'Acceso restringido: Se requieren privilegios de Administrador LIMITLESS.'
    });
  }
  next();
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireAdmin
};
