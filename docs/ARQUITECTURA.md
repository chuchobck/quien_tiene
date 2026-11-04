# Arquitectura

## Módulos y quién conoce qué

| Módulo | Responsabilidad | No sabe |
|---|---|---|
| `whatsapp/` | Cliente Cloud API (con dry-run), tipos de mensaje, webhook | del flujo |
| `cola/` | BullMQ: colas `mensajes` y `cierres`, workers, reintentos | de recetas |
| `core/orquestador.ts` | **Único** que conoce el flujo completo y la máquina de estados | de Prisma ni de proveedores concretos |
| `core/catalogo.ts` | Resolución de una medicación al segmento de mercado (función pura) | de la base |
| `ai/` | `RecipeReader` + proveedores `mock`, `gemini`, `meta`; zod; prompt | de farmacias |
| `gemini/` | Llamada cruda a Gemini con reintento 503/429 | de recetas |
| `maps/` | Distancia caminando (OSRM, respaldo Haversine) | de recetas |
| `store/` | **Única** puerta a datos: interfaz `Store` (Prisma y memoria) | del flujo |
| `demanda/` | Vista agregada de demanda por farmacia | del paciente |

## Flujo de un mensaje

1. `POST /webhook` extrae los mensajes, deduplica con `InboundMessage` (clave primaria = `message.id`), encola con `jobId = message.id` y responde 200 al instante. Si encolar falla, olvida el id para que el reintento de Meta entre.
2. El worker de mensajes tiene **concurrencia 1** (ver abajo). Procesa un mensaje y enruta (`manejarMensaje`): paciente/farmacia, texto/imagen/ubicación/botón propio/botón de plantilla.
3. Imagen o texto → `RecipeReader` → `RecipeExtraction` (zod) → cada medicación se resuelve al segmento. 0 → mensaje amable; 1 → confirmación; varias → el paciente elige (máx. 3 botones).
4. Confirmar → transición atómica `esperando_confirmacion → consultando`; se pregunta a las farmacias activas en paralelo (cada una aislada) y se programa el cierre como job con delay.
5. Respuestas de farmacia (botón de plantilla o texto) y precio actualizan `PharmacyQuery`. Si ya no queda nada abierto, se cierra antes del delay.
6. `cerrarSolicitud` es idempotente (transición atómica): solo el primero envía el resultado.

## Orden y concurrencia

El worker de `mensajes` corre con **concurrencia 1**: procesa un mensaje a la vez, en orden de llegada. Motivo: con concurrencia 5, un "Sí tengo" y el precio que la farmacia manda enseguida podían procesarse en paralelo y el precio se perdía (se descarta si la respuesta aún no es `si_tengo`).

Costos y límites, a propósito explícitos:

- Un mensaje lento (leer una receta con el modelo puede tardar segundos) retrasa a todos los que vienen detrás, de cualquier paciente o farmacia. Con el tráfico de un demo es aceptable; con mucho tráfico habría que agrupar por remitente (no construido).
- La garantía de orden vale con **un solo proceso worker**. Si arrancas el worker embebido en el servidor Y `npm run worker` a la vez, o varios workers, el orden entre procesos no está garantizado. Usa uno solo.
- El worker de `cierres` mantiene concurrencia 5: cerrar solicitudes distintas es independiente.
- Sin medir: no hay cifras de latencia con carga; solo se razonó el orden. La simulación lo ejercita pero no mide rendimiento.

## Máquina de estados (`core/estados.ts`)

```
esperando_seleccion → esperando_confirmacion → consultando → resuelta | sin_resultados
```

## Fallos

- Maps/OSRM cae → Haversine, el flujo sigue.
- Lector de IA: reintento con backoff ante 429/5xx; salida que no valida → un reintento pidiendo corregir; luego `ErrorLecturaReceta` → el paciente recibe "no alcancé a leer la receta".
- Cualquier otro error en un job → reintentos de BullMQ (3, backoff exponencial); al agotarse, el job queda en `failed` y el paciente recibe un mensaje amable.
- Limitación conocida: si un job falla a mitad y se reintenta, puede repetirse un mensaje saliente o crearse una solicitud duplicada (no hay idempotencia a nivel de paso).

## Privacidad

Los logs enmascaran teléfonos. La vista de demanda solo entrega conteos por segmento. La base sí guarda el teléfono del paciente (hace falta para responderle); no hay política de retención todavía.
