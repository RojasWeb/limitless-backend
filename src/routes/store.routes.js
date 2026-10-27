/**
 * LIMITLESS BACKEND — RUTAS DE TIENDA, PRODUCTOS, CARRITO, PEDIDOS Y FAVORITOS
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

/**
 * GET /api/v1/store/categories
 * Las 3 categorías maestras de la tienda.
 */
router.get('/categories', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, nombre, slug, descripcion, imagen 
       FROM categories 
       WHERE estado = 'activa' 
       ORDER BY id ASC`
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error en GET /store/categories:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar categorías.' });
  }
});

/**
 * GET /api/v1/store/products
 * Catálogo con soporte para filtros por categoría, deporte, búsqueda y ordenamiento.
 */
router.get('/products', optionalAuth, async (req, res) => {
  try {
    const { category, sport, search, sort } = req.query;

    let queryStr = `
      SELECT 
        p.*,
        c.nombre as category_nombre,
        c.slug as category_slug,
        (
          SELECT json_agg(s.slug)
          FROM product_sports ps
          JOIN sports s ON ps.sport_id = s.id
          WHERE ps.product_id = p.id
        ) as deportes_aplicables,
        ${req.user ? `EXISTS(SELECT 1 FROM favorites WHERE product_id = p.id AND user_id = $1)` : 'false'} AS is_favorite
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.estado = 'activo'
    `;

    const params = [];
    if (req.user) params.push(req.user.id);

    if (category && category !== 'all') {
      params.push(category.toLowerCase());
      queryStr += ` AND c.slug = $${params.length}`;
    }

    if (sport && sport !== 'all') {
      params.push(sport.toLowerCase());
      queryStr += ` AND EXISTS (
        SELECT 1 FROM product_sports ps2
        JOIN sports s2 ON ps2.sport_id = s2.id
        WHERE ps2.product_id = p.id AND s2.slug = $${params.length}
      )`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      queryStr += ` AND (p.nombre ILIKE $${params.length} OR p.descripcion ILIKE $${params.length})`;
    }

    // Ordenamiento
    if (sort === 'price-low') {
      queryStr += ' ORDER BY p.precio ASC';
    } else if (sort === 'price-high') {
      queryStr += ' ORDER BY p.precio DESC';
    } else {
      queryStr += ' ORDER BY p.id ASC';
    }

    const { rows } = await db.query(queryStr, params);

    const mapped = rows.map(p => {
      const sportsList = p.deportes_aplicables || [];
      return {
        id: String(p.id),
        name: p.nombre,
        slug: p.slug,
        category: p.category_slug,
        categoryLabel: p.category_nombre.toUpperCase(),
        sport: sportsList.length > 0 ? sportsList[0] : 'general',
        price: Number(p.precio),
        priceFormatted: `$ ${Number(p.precio).toLocaleString('es-CO')} COP`,
        oldPrice: p.precio_anterior ? `$ ${Number(p.precio_anterior).toLocaleString('es-CO')} COP` : null,
        image: p.imagen_principal,
        badge: p.badge,
        desc: p.descripcion,
        stock: p.stock,
        isFavorite: Boolean(p.is_favorite)
      };
    });

    return res.json({ success: true, count: mapped.length, data: mapped });
  } catch (err) {
    console.error('Error en GET /store/products:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar productos.' });
  }
});

/**
 * GET /api/v1/store/products/:id
 * Detalle completo de producto.
 */
router.get('/products/:id', async (req, res) => {
  try {
    const prodId = parseInt(req.params.id, 10);
    const { rows } = await db.query(
      `SELECT p.*, c.nombre as category_nombre, c.slug as category_slug 
       FROM products p 
       JOIN categories c ON p.category_id = c.id 
       WHERE p.id = $1`,
      [prodId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado.' });
    }

    const prod = rows[0];

    // Galería
    const imagesQuery = await db.query(
      'SELECT image_url, orden FROM product_images WHERE product_id = $1 ORDER BY orden ASC',
      [prodId]
    );

    return res.json({
      success: true,
      data: {
        ...prod,
        galeria: imagesQuery.rows
      }
    });
  } catch (err) {
    console.error('Error en GET /store/products/:id:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar producto.' });
  }
});

/**
 * GET /api/v1/store/cart
 * Obtiene el carrito persistente del deportista.
 */
router.get('/cart', requireAuth, async (req, res) => {
  try {
    // Buscar o crear carrito activo
    let cartRes = await db.query(
      'SELECT id FROM carts WHERE user_id = $1 AND estado = $2',
      [req.user.id, 'activo']
    );

    let cartId;
    if (cartRes.rows.length === 0) {
      const newCart = await db.query(
        'INSERT INTO carts (user_id, estado) VALUES ($1, $2) RETURNING id',
        [req.user.id, 'activo']
      );
      cartId = newCart.rows[0].id;
    } else {
      cartId = cartRes.rows[0].id;
    }

    // Obtener items
    const itemsRes = await db.query(
      `SELECT ci.id, ci.product_id, ci.cantidad, ci.precio_unitario,
              p.nombre, p.imagen_principal, p.stock, c.nombre as category_nombre
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       JOIN categories c ON p.category_id = c.id
       WHERE ci.cart_id = $1
       ORDER BY ci.id ASC`,
      [cartId]
    );

    const items = itemsRes.rows.map(i => ({
      id: String(i.product_id),
      cartItemId: i.id,
      name: i.nombre,
      price: Number(i.precio_unitario),
      priceFormatted: `$ ${Number(i.precio_unitario).toLocaleString('es-CO')} COP`,
      image: i.imagen_principal,
      categoryLabel: i.category_nombre.toUpperCase(),
      quantity: i.cantidad,
      stock: i.stock
    }));

    const total = items.reduce((acc, curr) => acc + (curr.price * curr.quantity), 0);

    return res.json({
      success: true,
      data: {
        cartId,
        items,
        total,
        totalFormatted: `$ ${total.toLocaleString('es-CO')} COP`,
        itemCount: items.reduce((acc, curr) => acc + curr.quantity, 0)
      }
    });
  } catch (err) {
    console.error('Error en GET /store/cart:', err);
    return res.status(500).json({ success: false, error: 'Error al obtener el carrito.' });
  }
});

/**
 * POST /api/v1/store/cart/items
 * Agrega un producto a la bolsa deportiva persistente.
 */
router.post('/cart/items', requireAuth, async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const prodId = parseInt(productId, 10);
    const qty = parseInt(quantity, 10) || 1;

    // Verificar producto y precio actual
    const prodRes = await db.query('SELECT id, precio, stock FROM products WHERE id = $1 AND estado = $2', [prodId, 'activo']);
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Producto no disponible o agotado.' });
    }

    const product = prodRes.rows[0];

    // Obtener carrito
    let cartRes = await db.query('SELECT id FROM carts WHERE user_id = $1 AND estado = $2', [req.user.id, 'activo']);
    let cartId = cartRes.rows.length > 0 ? cartRes.rows[0].id : null;

    if (!cartId) {
      const c = await db.query('INSERT INTO carts (user_id, estado) VALUES ($1, $2) RETURNING id', [req.user.id, 'activo']);
      cartId = c.rows[0].id;
    }

    // Insertar o actualizar item
    const itemQuery = `
      INSERT INTO cart_items (cart_id, product_id, cantidad, precio_unitario)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (cart_id, product_id) DO UPDATE SET
        cantidad = cart_items.cantidad + EXCLUDED.cantidad,
        precio_unitario = EXCLUDED.precio_unitario
      RETURNING *
    `;

    const { rows } = await db.query(itemQuery, [cartId, prodId, qty, product.precio]);

    return res.status(201).json({
      success: true,
      message: 'Producto añadido a la bolsa deportiva.',
      data: rows[0]
    });
  } catch (err) {
    console.error('Error en POST /store/cart/items:', err);
    return res.status(500).json({ success: false, error: 'Error al añadir producto al carrito.' });
  }
});

/**
 * DELETE /api/v1/store/cart/items/:id
 * Remueve un producto del carrito.
 */
router.delete('/cart/items/:id', requireAuth, async (req, res) => {
  try {
    const prodId = parseInt(req.params.id, 10);
    await db.query(
      `DELETE FROM cart_items ci
       USING carts c
       WHERE ci.cart_id = c.id AND c.user_id = $1 AND ci.product_id = $2`,
      [req.user.id, prodId]
    );
    return res.json({ success: true, message: 'Producto eliminado del carrito.' });
  } catch (err) {
    console.error('Error en DELETE /store/cart/items/:id:', err);
    return res.status(500).json({ success: false, error: 'Error al remover producto.' });
  }
});

/**
 * POST /api/v1/store/checkout
 * Procesa la orden de compra en una transacción atómica:
 * 1. Crea la orden en orders.
 * 2. Guarda el snapshot inmutable en order_items.
 * 3. Registra el pago en payments.
 * 4. Deduce el inventario en products y registra en inventory_movements.
 * 5. Vacía el carrito activo.
 */
router.post('/checkout', requireAuth, async (req, res) => {
  const client = await db.getClient();
  try {
    const { items, metodoPago, direccion, ciudad, departamento } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay productos en la orden de compra.' });
    }

    if (!direccion) {
      return res.status(400).json({ success: false, error: 'La dirección de entrega es obligatoria.' });
    }

    await client.query('BEGIN');

    let subtotal = 0;
    const validatedItems = [];

    // Validar existencias y precios reales en base de datos
    for (const item of items) {
      const prodId = parseInt(item.id, 10);
      const qty = parseInt(item.quantity || 1, 10);

      const pRes = await client.query('SELECT id, nombre, precio, stock FROM products WHERE id = $1 FOR UPDATE', [prodId]);
      if (pRes.rows.length === 0) {
        throw new Error(`Producto #${prodId} ya no está disponible.`);
      }
      const prod = pRes.rows[0];
      if (prod.stock < qty) {
        throw new Error(`Stock insuficiente para "${prod.nombre}". Disponibles: ${prod.stock}`);
      }

      const itemTotal = Number(prod.precio) * qty;
      subtotal += itemTotal;

      validatedItems.push({
        id: prod.id,
        nombre: prod.nombre,
        precio: prod.precio,
        cantidad: qty,
        subtotal: itemTotal
      });
    }

    const orderNumber = `LMT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
    const envio = subtotal > 150000 ? 0 : 12000;
    const total = subtotal + envio;

    // 1. Insertar orden
    const insertOrder = `
      INSERT INTO orders (
        user_id, numero_pedido, subtotal, envio, descuento, total, estado,
        metodo_pago, direccion_envio, ciudad_envio, departamento_envio
      ) VALUES ($1, $2, $3, $4, 0, $5, 'confirmado', $6, $7, $8, $9)
      RETURNING id, numero_pedido, total, fecha_creacion
    `;

    const oRes = await client.query(insertOrder, [
      req.user.id,
      orderNumber,
      subtotal,
      envio,
      total,
      metodoPago || 'pse',
      direccion.trim(),
      ciudad ? ciudad.trim() : (req.user.ciudad || 'Cartago'),
      departamento || 'Valle del Cauca'
    ]);

    const order = oRes.rows[0];

    // 2. Insertar líneas de pedido y actualizar inventario
    for (const vItem of validatedItems) {
      // Línea de pedido con snapshot inmutable
      await client.query(
        `INSERT INTO order_items (order_id, product_id, nombre_producto, cantidad, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, vItem.id, vItem.nombre, vItem.cantidad, vItem.precio, vItem.subtotal]
      );

      // Descontar stock
      await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2',
        [vItem.cantidad, vItem.id]
      );

      // Registrar kardex
      await client.query(
        `INSERT INTO inventory_movements (product_id, tipo, cantidad, motivo, referencia_id)
         VALUES ($1, 'salida', $2, 'Venta en tienda web', $3)`,
        [vItem.id, vItem.cantidad, order.numero_pedido]
      );
    }

    // 3. Registrar pago
    await client.query(
      `INSERT INTO payments (order_id, monto, metodo, estado, referencia)
       VALUES ($1, $2, $3, 'aprobado', $4)`,
      [order.id, total, metodoPago || 'pse', `PAY-${Date.now()}`]
    );

    // 4. Limpiar carrito activo del usuario
    await client.query(
      `DELETE FROM cart_items ci
       USING carts c
       WHERE ci.cart_id = c.id AND c.user_id = $1`,
      [req.user.id]
    );

    // 5. Crear notificación de pedido
    await client.query(
      `INSERT INTO notifications (user_id, tipo, titulo, mensaje, referencia_id, referencia_tipo)
       VALUES ($1, 'pedido', $2, $3, $4, 'order')`,
      [
        req.user.id,
        `Pedido confirmado: #${order.numero_pedido}`,
        `Tu orden por $ ${total.toLocaleString('es-CO')} COP ha sido procesada con éxito y está en preparación.`,
        String(order.id)
      ]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: `¡Pedido #${order.numero_pedido} procesado exitosamente!`,
      data: {
        orderId: order.id,
        orderNumber: order.numero_pedido,
        total: Number(order.total),
        totalFormatted: `$ ${Number(order.total).toLocaleString('es-CO')} COP`
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en POST /store/checkout:', err);
    return res.status(500).json({ success: false, error: err.message || 'Error al procesar el pedido.' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/store/orders
 * Historial de pedidos del deportista.
 */
router.get('/orders', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT o.*,
              (
                SELECT json_agg(oi.*)
                FROM order_items oi
                WHERE oi.order_id = o.id
              ) as items
       FROM orders o
       WHERE o.user_id = $1
       ORDER BY o.fecha_creacion DESC`,
      [req.user.id]
    );

    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('Error en GET /store/orders:', err);
    return res.status(500).json({ success: false, error: 'Error al consultar pedidos.' });
  }
});

/**
 * POST /api/v1/store/favorites
 * Alterna un producto como favorito.
 */
router.post('/favorites', requireAuth, async (req, res) => {
  try {
    const { productId } = req.body;
    const prodId = parseInt(productId, 10);

    const existing = await db.query(
      'SELECT id FROM favorites WHERE user_id = $1 AND product_id = $2',
      [req.user.id, prodId]
    );

    if (existing.rows.length > 0) {
      await db.query('DELETE FROM favorites WHERE id = $1', [existing.rows[0].id]);
      return res.json({ success: true, isFavorite: false, message: 'Producto eliminado de favoritos.' });
    } else {
      await db.query('INSERT INTO favorites (user_id, product_id) VALUES ($1, $2)', [req.user.id, prodId]);
      return res.json({ success: true, isFavorite: true, message: 'Producto guardado en favoritos.' });
    }
  } catch (err) {
    console.error('Error en POST /store/favorites:', err);
    return res.status(500).json({ success: false, error: 'Error al actualizar favoritos.' });
  }
});

module.exports = router;
