# Checklist de mañana (con la API key de dev.meta.ai)

Estado de partida: todo el flujo verificado con `RECIPE_PROVIDER=mock`. El adaptador de Meta (`src/ai/meta.ts`) está **sin verificar**: se escribió sin acceso a la documentación oficial (`dev.meta.ai` y `ai.developer.meta.com` no resolvían desde el entorno de construcción) y sin llave.

## 1. Activar y configurar (5 min)

1. Activar billing y crear la API key en dev.meta.ai.
2. En `.env`: `META_API_KEY=...`, `RECIPE_PROVIDER=meta`.
3. **Leer la documentación oficial** y confirmar o corregir estos supuestos (cada uno es configurable o está en `src/ai/meta.ts`):

| Supuesto | Variable / lugar | Notas |
|---|---|---|
| Base URL `https://dev.meta.ai` | `META_API_BASE_URL` | Fragmentos de terceros hablan de `https://api.meta.ai/v1`: puede ser otra |
| Ruta `/v1/chat/completions` | `META_API_CHAT_PATH` | Si la base ya trae `/v1`, ajustar |
| Auth `Authorization: Bearer <key>` | `meta.ts`, `llamar()` | |
| Modelo `muse-spark-1.1` | `META_MODEL` | Fragmentos de terceros mencionan también `muse-spark-1.2` (y quizá más nuevos) |
| Imagen como `{type:'image_url', image_url:{url:'data:...;base64,...'}}` | `meta.ts`, `readImage` | Puede requerir otro formato (p. ej. API Responses) |
| Mensaje `system` aceptado | `meta.ts` | |
| Texto en `choices[0].message.content` | `extraerTexto()` | |
| JSON mode `response_format: {type:'json_object'}` | `META_JSON_MODE=true` | Apagado por defecto; la salida igual se valida con zod |

## 2. Pruebas exactas del adaptador (15 min)

Con `RECIPE_PROVIDER=meta`:

```bash
npm run probar:ia -- "Enalapril 10 mg"            # 1. texto simple
npm run probar:ia -- "la pastilla de la presión"  # 2. coloquial: debe venir confidence low y SIN adivinar principio activo
npm run probar:ia -- ruta/receta-sintetica.jpg    # 3. imagen (formato de visión)
```

Anotar para cada una: ¿HTTP 200? ¿el JSON valida el esquema a la primera o necesitó el reintento de corrección (se ve en el log `salida invalida`)? ¿ms?

Casos a forzar:
- [ ] Imagen: ¿acepta data URI base64 jpeg? ¿y png? ¿tamaño máximo?
- [ ] 401 con key mala (`META_API_KEY=x`): debe fallar rápido con "no reintentable", sin crash.
- [ ] 429: ver el backoff (si se logra provocar; si no, marcar "no probado").
- [ ] Timeout: el límite es 30 s por intento; si la visión tarda más, subir `TIMEOUT_MS` en `meta.ts`.
- [ ] El modelo NO debe recomendar, sustituir ni dosificar (revisar `notes` y todos los campos en las 5 recetas).
- [ ] Probar con `META_JSON_MODE=true`: ¿lo acepta el endpoint?

Si algo falla por formato: corregir `src/ai/meta.ts`, actualizar el banner UNVERIFIED (quitarlo solo para lo realmente confirmado) y el README.

## 3. Cinco recetas sintéticas (20 min)

Crear 5 imágenes **sintéticas** (inventadas por ti: letra a mano o impresa, sin datos reales de pacientes ni médicos). Guardarlas **fuera del repo** o con nombre `receta*.jpg` (ya está en `.gitignore`). Mezclar: 1 clara con marca (Dolex), 1 con 2 medicamentos, 1 de letra dudosa, 1 ilegible, 1 con concentración que no esté en el catálogo.

```bash
for f in ~/recetas-sinteticas/receta*.jpg; do npm run probar:ia -- "$f"; done
```

Tabla a llenar (solo con lo observado):

| # | Qué se esperaba | Qué leyó | ¿Resolvió al segmento? | ms |
|---|---|---|---|---|

## 4. Flujo completo con la IA real y medir con reloj

`scripts/simular-flujo.ts` fuerza `RECIPE_PROVIDER=mock` a propósito. Para el flujo real por WhatsApp, usar `npm run dev` con `WHATSAPP_DRY_RUN=false`, número de prueba de Meta y un teléfono real. Medir **con reloj** (cronómetro) de "envío la foto" a "recibo el resultado". No escribir en el README ningún tiempo que no se haya medido así.

## 5. Después

- [ ] Actualizar en el README: "AI provider used in the demo" (proveedor real + tiempo medido, o "mock" si no se logró).
- [ ] Quitar de "unverified" solo lo confirmado.
- [ ] Repetir el escaneo de secretos antes del push final (tokens, `593\d{9}`, imágenes, IDs de Meta).
- [ ] Si hay tiempo: probar `docker compose up -d` en una máquina con Docker (nunca se probó).
