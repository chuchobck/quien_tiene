# Constitución del proyecto — ¿Quién Tiene?

Este archivo gobierna cómo se escribe código en este repositorio. Léelo completo
antes de tocar cualquier archivo.

---

## 1. Qué es esto

Buscador de disponibilidad de medicinas en farmacias del Ecuador, operado
enteramente por WhatsApp. El paciente pregunta, la red de farmacias responde,
el paciente recibe quién tiene, a qué precio y a qué distancia caminando.

**El producto no es el bot. El producto es la base de datos de qué medicina hay
en qué farmacia.** El bot es la interfaz; la red es el activo. Cuando haya que
elegir entre algo que mejora la conversación y algo que mejora la calidad del
dato de stock, gana el dato.

Contexto completo del producto: `docs/alcance.md`.

---

## 2. Estado actual

**Fase: Meta Global AI Developer Hackathon (Cerebral Valley + Meta), track
Desarrollador Independiente, en solitario.** Entrega: miércoles 4 de noviembre
de 2026, 9:00 PM hora de Ecuador.

Antes hubo un prototipo para el DevFest Quito 2026 (sep 2026, con Gemini). Eso se
declara tal cual en el README: lo del hackathon es lo construido desde entonces.

**Regla de honestidad (no negociable):** README, docs y todo texto que vaya a
jueces describen SOLO lo que existe y fue probado. Lo no construido va en una
sección "Plan". Lo que no se pudo verificar (p. ej. el adaptador de la Meta
Model API sin llave) se marca "sin verificar". No se afirma el uso de ninguna
herramienta que no se usó.

---

## 3. Decisiones cerradas — no reabrir

| Decisión | Alternativas descartadas |
|---|---|
| **Meta WhatsApp Cloud API** | Evolution API (riesgo de legitimidad y de bloqueo del número), Twilio (costo innecesario sobre la misma API) |
| **Modelos de Meta (Meta Model API) reemplazan a Gemini para el hackathon**, detrás de la interfaz `RecipeReader` (`src/ai/`). Gemini y un mock quedan como proveedores intercambiables | OCR tradicional: no lee letra manuscrita de médico |
| **OSRM** para distancia caminando, con respaldo Haversine | Google Maps (exige facturación), línea recta (miente en terreno con pendientes) |
| **Fastify + Node + TypeScript strict** | NestJS (no migrar) |
| **PostgreSQL + Prisma, Redis + BullMQ** (ahora SÍ en alcance) | Store en memoria (queda solo como doble de pruebas) |

**Cloud Run ya no es obligatorio** (era requisito del reto del DevFest, no de este
hackathon). El `Dockerfile` existe pero el despliegue está sin probar.

**Descartado del producto:** alertas de precio sobre el techo legal. La farmacia
es el cliente que paga y no se arranca vigilándola; además el dato público del
MSP es de fiabilidad dudosa. No reintroducir.

---

## 4. Reglas de código

- **TypeScript strict.** `any` está prohibido. Si el tipo no se conoce, se
  modela con `unknown` y se estrecha.
- **Nombres de dominio en español**, nombres de API en inglés. `farmaciaRespondio`,
  no `pharmacyResponded`; pero `fetch`, `JSON.parse`, `Promise` como vienen.
- **Un módulo, una responsabilidad.** `gemini/` no sabe qué es una farmacia.
  `maps/` no sabe qué es una receta. El único que conoce el flujo completo es
  `core/orquestador.ts`.
- **`store/` es la única puerta a la persistencia.** Ningún otro módulo toca
  Prisma ni estructuras de datos directamente. Hay dos implementaciones de la
  misma interfaz `Store`: Prisma (real) y memoria (solo pruebas).
- **`ai/` es la única puerta a los modelos.** El resto habla con `RecipeReader`
  y recibe `RecipeExtraction` validada con zod; nunca con un proveedor concreto.
- **Fallar temprano en configuración, degradar con gracia en runtime.**
  `config.ts` revienta al arrancar si falta una variable. Pero si Maps falla en
  medio de una consulta, se usa el respaldo Haversine y el flujo continúa: nunca
  se deja al paciente sin respuesta por culpa de una API de terceros. Si un job
  agota reintentos, el paciente recibe un mensaje amable de error.
- **Los logs no llevan teléfonos completos:** `util/log.ts` los enmascara
  (últimos 4 dígitos). El repo es público.
- **Los webhooks son idempotentes.** Meta reintenta. Todo mensaje entrante se
  deduplica por `message.id` antes de procesarse.
- **Responder 200 a Meta de inmediato**, antes de procesar. El webhook solo
  valida, deduplica (tabla `InboundMessage`, unique) y encola en BullMQ; el
  trabajo lo hace el worker.

---

## 5. Reglas de producto que el código debe respetar

Estas no son preferencias de estilo. Violarlas es un defecto grave.

- **Nunca sugerir un sustituto, una dosis ni un tratamiento.** Se muestra qué hay
  en el mismo segmento de mercado y decide el paciente con su farmacéutico. Esto
  aplica también a los prompts de Gemini.
- **Nunca cerrar una transacción.** El flujo de todo medicamento recetado termina
  en "esta farmacia lo tiene, ve con tu receta".
- **El paciente nunca paga.**
- **"No tengo" es una respuesta valiosa** y jamás se penaliza. Lo que se penaliza
  es el silencio.
- **Nunca abrir canal directo entre farmacia y paciente.** El contacto pasa por
  el sistema hasta que el paciente decide ir.

---

## 6. Idioma

Todo el texto que ve un usuario va en **español ecuatoriano**:

- "tienes", no "tenés"
- "vitrina", no "anaquel"
- "ve con tu receta", no "andá con tu receta"
- "aquí", no "acá"

Los comentarios de código también van en español.

---

## 7. Qué NO construir en esta fase

Pedir confirmación antes de tocar cualquiera de estas. Siguen siendo fases
posteriores (ver `docs/alcance.md`):

- Cascada por olas con priorización por historial
- Puntajes de reputación y veracidad
- Panel web de farmacia con autenticación (solo existe la vista mínima de demanda)
- Flujo de inscripción de farmacias
- Planes de suscripción y cobros
- Delivery, pagos, carrito

Ya NO están vedados (entran en alcance del hackathon): PostgreSQL, Prisma,
migraciones, BullMQ, Redis, colas.

---

## 8. Registro de trabajo

Cada sesión de trabajo se anota al final de `docs/estado.md`, en una línea.
Append-only: no se edita lo anterior. Formato:

```
## 2026-09-17 — sesión
- qué se construyó
- qué quedó roto o pendiente
- decisión tomada, si hubo alguna
```
