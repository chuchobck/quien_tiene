# Estado del proyecto

Registro append-only. No editar entradas anteriores.

---

## 2026-09-17 — andamiaje inicial

- Estructura completa del proyecto, TypeScript strict, compila limpio.
- Cliente de Meta WhatsApp Cloud API: texto, botones, plantilla, descarga de media.
- Cliente de Gemini para lectura de receta (imagen) y de texto coloquial.
- Cliente de Maps con distancia caminando y respaldo Haversine.
- Catálogo semilla: 15 segmentos de mercado, 5 farmacias (3 activas).
- Orquestador con el flujo completo: foto o texto → confirmación → consulta a
  farmacias → captura de precio → respuesta ordenada al paciente.
- Webhook con verificación de Meta e idempotencia por message.id.
- Store en memoria, aislado tras una sola interfaz.

Verificado: `npm run build` limpio, servidor arranca, webhook responde el
challenge de Meta, el ruteo paciente/farmacia distingue bien, la resolución de
catálogo acierta en directa, marca y coloquial.

Pendiente: probar Gemini contra recetas reales (Fase 0.2) y desplegar en
Cloud Run (Fase 0.3).

## 2026-11-04 — sesión hackathon (Meta Global AI Developer Hackathon)

- Higiene de repo público (escaneo de árbol e historial limpio, .gitignore, LICENSE MIT, logs con teléfonos enmascarados).
- PostgreSQL + Prisma (esquema, migración, seed), Redis + BullMQ (mensajes + cierre con delay), store tras interfaz `Store`.
- `src/ai/`: interfaz `RecipeReader` con proveedores mock, gemini y meta, validados con zod; selección de medicamento (máx. 3 botones); WHATSAPP_DRY_RUN; `npm run simular`; 38 tests vitest; vista mínima de demanda.
- Verificado: typecheck limpio, `npm test` y `npm run simular` pasan contra Postgres 16 y Redis 7 instalados con apt.
- Sin verificar / pendiente: adaptador de la Meta Model API (sin docs oficiales ni key: ver docs/MANANA.md); docker-compose y Dockerfile (sin daemon de Docker); ninguna receta real leída en esta versión; firma `X-Hub-Signature-256` del webhook; demanda sin autenticación.
- Decisión: modelos de Meta reemplazan a Gemini para el hackathon; Cloud Run deja de ser obligatorio; Postgres/Prisma/BullMQ entran en alcance (CLAUDE.md actualizado).
