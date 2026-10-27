/**
 * LIMITLESS BACKEND — RUTAS DE AUTENTICACIÓN
 * ==============================================================================
 * Registro, Login, Sesión actual y Cambio de contraseña con hash seguro bcrypt.
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_limitless_sports_2026_xyz987654321';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * POST /api/v1/auth/register
 * Registra un nuevo deportista en Neon PostgreSQL.
 */
router.post('/register', async (req, res) => {
  try {
    const { nombre, apellido, username, email, password, ciudad } = req.body;

    // Validación básica de entrada
    if (!nombre || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Nombre, correo electrónico y contraseña son campos obligatorios.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'La contraseña debe tener al menos 6 caracteres.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = (username || cleanEmail.split('@')[0]).toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
    const cleanCity = ciudad ? ciudad.trim() : 'Cartago';

    // Verificar si el correo o el username ya existen
    const existing = await db.query(
      'SELECT id, email, username FROM users WHERE (email = $1 OR username = $2) AND deleted_at IS NULL',
      [cleanEmail, cleanUsername]
    );

    if (existing.rows.length > 0) {
      const match = existing.rows[0];
      if (match.email === cleanEmail) {
        return res.status(409).json({ success: false, error: 'Ya existe una cuenta registrada con este correo electrónico.' });
      }
      return res.status(409).json({ success: false, error: 'El nombre de usuario ya está en uso. Por favor elige otro.' });
    }

    // Hashear contraseña con bcrypt
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Inserción segura parametrizada
    const insertQuery = `
      INSERT INTO users (
        nombre, apellido, username, email, password_hash, ciudad, pais, rol, estado, email_verificado
      ) VALUES ($1, $2, $3, $4, $5, $6, 'Colombia', 'usuario', 'activo', true)
      RETURNING id, nombre, apellido, username, email, ciudad, foto_perfil, rol, fecha_registro
    `;

    const { rows } = await db.query(insertQuery, [
      nombre.trim(),
      (apellido || '').trim(),
      cleanUsername,
      cleanEmail,
      passwordHash,
      cleanCity
    ]);

    const newUser = rows[0];

    // Asignar deporte por defecto (Basketball id 1) en user_sports
    try {
      await db.query(
        'INSERT INTO user_sports (user_id, sport_id, nivel, es_principal) VALUES ($1, 1, $2, true) ON CONFLICT DO NOTHING',
        [newUser.id, 'Intermedio']
      );
    } catch (_) {}

    // Generar Token JWT
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, username: newUser.username, rol: newUser.rol },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      success: true,
      message: '¡Registro completado exitosamente en LIMITLESS!',
      data: {
        user: newUser,
        token
      }
    });
  } catch (err) {
    console.error('Error en POST /auth/register:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor al procesar el registro.' });
  }
});

/**
 * POST /api/v1/auth/login
 * Autentica usuario por email o username y devuelve token JWT.
 */
router.post('/login', async (req, res) => {
  try {
    const { identifier, email, username, password } = req.body;
    const loginUser = (identifier || email || username || '').toLowerCase().trim();

    if (!loginUser || !password) {
      return res.status(400).json({
        success: false,
        error: 'Por favor ingresa tu correo/usuario y tu contraseña.'
      });
    }

    // Buscar usuario en Neon
    const { rows } = await db.query(
      `SELECT id, nombre, apellido, username, email, password_hash, foto_perfil, ciudad, rol, estado, biografia
       FROM users 
       WHERE (email = $1 OR username = $1) AND deleted_at IS NULL`,
      [loginUser]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas. Verifica tu correo y contraseña.'
      });
    }

    const user = rows[0];

    if (user.estado === 'bloqueado') {
      return res.status(403).json({
        success: false,
        error: 'Tu cuenta ha sido suspendida. Contacta a soporte@limitless.sport.'
      });
    }

    // Verificar hash de contraseña
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas. Contraseña incorrecta.'
      });
    }

    // Actualizar última conexión
    await db.query('UPDATE users SET ultima_conexion = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Generar JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, rol: user.rol },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Ocultar hash en la respuesta
    delete user.password_hash;

    return res.json({
      success: true,
      message: `¡Bienvenido de vuelta, ${user.nombre}!`,
      data: {
        user,
        token
      }
    });
  } catch (err) {
    console.error('Error en POST /auth/login:', err);
    return res.status(500).json({ success: false, error: 'Error interno del servidor al iniciar sesión.' });
  }
});

/**
 * GET /api/v1/auth/me
 * Obtiene el perfil y métricas completas del deportista autenticado.
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    // Obtener estadísticas de la vista analítica vw_athlete_stats
    const statsQuery = await db.query(
      'SELECT * FROM vw_athlete_stats WHERE user_id = $1',
      [req.user.id]
    );

    // Deportes que practica
    const sportsQuery = await db.query(
      `SELECT s.id, s.nombre, s.slug, s.icono, us.nivel, us.posicion, us.es_principal 
       FROM user_sports us 
       JOIN sports s ON us.sport_id = s.id 
       WHERE us.user_id = $1`,
      [req.user.id]
    );

    return res.json({
      success: true,
      data: {
        user: req.user,
        stats: statsQuery.rows[0] || null,
        sports: sportsQuery.rows
      }
    });
  } catch (err) {
    console.error('Error en GET /auth/me:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener datos de la sesión actual.' });
  }
});

module.exports = router;
