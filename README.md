# Arquitectura Backend & API REST — LIMITLESS

Documentación del diseño backend y los endpoints de la API REST que conectan el frontend con la base de datos de LIMITLESS.

---

## 1. Arquitectura en Capas

```
          [ Cliente Frontend (HTML5 / Vanilla JS / Mobile) ]
                                   │
                                   ▼
                 [ HTTP Requests + Bearer JWT Token ]
                                   │
                                   ▼
             [ API Gateway / Express / Fastify Routes ]
                 ├── Rate Limiting & Helmet Security
                 ├── Auth & Role Middleware (admin/usuario)
                 └── Input Validation (Zod / Joi)
                                   │
                                   ▼
                     [ Capa de Servicios de Negocio ]
       (AuthService, MeetupService, TournamentService, StoreService, etc.)
                                   │
                                   ▼
                 [ Capa de Acceso a Datos / Repositorios ]
                      (Kysely / Prisma / PG Client)
                                   │
                                   ▼
                [ Base de Datos Relacional PostgreSQL 14+ ]
```

---

## 2. Especificación de Endpoints REST

### Autenticación & Usuarios (`/api/v1/auth`, `/api/v1/users`)
- `POST /api/v1/auth/register` — Registro de nuevo deportista con hash bcrypt.
- `POST /api/v1/auth/login` — Autenticación por email/usuario, retorno de JWT.
- `GET /api/v1/auth/me` — Datos del usuario en sesión.
- `PUT /api/v1/users/profile` — Actualización de foto, ciudad, biografía y deportes.
- `GET /api/v1/users/:id/stats` — Métricas calculadas desde `vw_athlete_stats`.

### Juntes Deportivos (`/api/v1/meetups`)
- `GET /api/v1/meetups` — Listado con filtros reactivos (`?sport=basketball&city=Cartago&level=Intermedio`).
- `POST /api/v1/meetups` — Creación de un junte deportivo (valida cupos y horario).
- `GET /api/v1/meetups/:id` — Detalle del junte con lista de asistentes.
- `POST /api/v1/meetups/:id/join` — Unirse al junte (valida cupo con trigger de base de datos).
- `DELETE /api/v1/meetups/:id/leave` — Abandonar junte y liberar cupo.

### Torneos & Partidos (`/api/v1/tournaments`)
- `GET /api/v1/tournaments` — Calendario oficial de campeonatos.
- `GET /api/v1/tournaments/:slug` — Ficha de torneo con premios y cupos restantes.
- `POST /api/v1/tournaments/:id/register` — Preinscripción de equipo o atleta individual.
- `GET /api/v1/tournaments/:id/matches` — Fixture y resultados de partidos.

### Tienda, Carrito & Pedidos (`/api/v1/store`)
- `GET /api/v1/store/products` — Catálogo con filtros por categoría, deporte, precio y búsqueda.
- `GET /api/v1/store/categories` — Las 3 categorías maestras.
- `GET /api/v1/store/cart` — Obtener bolsa de compra del usuario autenticado.
- `POST /api/v1/store/cart/items` — Añadir producto al carrito.
- `PUT /api/v1/store/cart/items/:id` — Actualizar cantidad.
- `DELETE /api/v1/store/cart/items/:id` — Eliminar artículo.
- `POST /api/v1/store/checkout` — Crear orden de compra con snapshot inmutable de precios.
- `POST /api/v1/store/payments/webhook` — Recepción de pagos (Wompi/PSE/Stripe).

### Comunidad & Chat (`/api/v1/community`, `/api/v1/chat`)
- `GET /api/v1/community/feed` — Feed social de publicaciones de cancha.
- `POST /api/v1/community/posts` — Publicar foto o estado deportivo.
- `POST /api/v1/community/posts/:id/like` — Alternar like en publicación.
- `GET /api/v1/community/groups` — Grupos deportivos regionales.
- `POST /api/v1/community/groups/:id/join` — Unirse a un grupo.
- `GET /api/v1/chat/conversations` — Conversaciones activas del usuario.
- `POST /api/v1/chat/conversations/:id/messages` — Enviar mensaje de chat.

### Soporte & CMS (`/api/v1/support`, `/api/v1/site`)
- `POST /api/v1/support/tickets` — Enviar ticket de soporte.
- `GET /api/v1/site/settings` — Parámetros globales y redes sociales.
- `GET /api/v1/site/content/:seccion` — Textos dinámicos del CMS.
