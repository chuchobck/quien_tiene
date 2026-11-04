# Checklist de mañana (con la API key de dev.meta.ai)

Estado de partida: todo el flujo verificado con `RECIPE_PROVIDER=mock`. El adaptador de Meta (`src/ai/meta.ts`) está **sin verificar**: se escribió sin acceso a la documentación oficial (`dev.meta.ai` y `ai.developer.meta.com` no resolvían desde el entorno de construcción) y sin llave.

## 1. Activar y configurar (5 min)

1. Activar billing y crear la API key en dev.meta.ai (el portal; la API vive en `api.meta.ai/v1`).
2. En `.env`: `MODEL_API_KEY=...` (alias: `META_API_KEY`), `RECIPE_PROVIDER=meta`.
3. **Leer la documentación oficial** y confirmar o corregir lo siguiente:

| Dato | Variable / lugar | Estado |
|---|---|---|
| Base `https://api.meta.ai/v1` | `META_API_BASE_URL` | Dado por el autor, sin comprobar |
| `Authorization: Bearer <key>` | `meta.ts`, `llamar()` | Dado por el autor, sin comprobar |
| Endpoints `POST /chat/completions` y `POST /responses` (compatibles con OpenAI) | `meta.ts`, `construirPeticion()` | Dado por el autor, sin comprobar |
| Modelo `muse-spark-1.1` | `META_MODEL` | Por defecto; fragmentos de terceros mencionan `muse-spark-1.2` |
| **Imagen, modo `chat`:** `{type:'image_url', image_url:{url:'data:...;base64,...'}}` en `/chat/completions` | `META_IMAGE_MODE=chat` (defecto) | **SIN VERIFICAR** |
| **Imagen, modo `responses`:** `{type:'input_image', image_url:'data:...'}` dentro de `input[].content` en `/responses`, prompt en `instructions` | `META_IMAGE_MODE=responses` | **SIN VERIFICAR** |
| Texto en `choices[0].message.content` (chat) / `output_text` u `output[type=message]` (responses) | `textoDeChat()`, `textoDeResponses()` | **SIN VERIFICAR** |
| Razonamiento aparte (partes `reasoning`, `reasoning_content`, items `reasoning`, `<think>`): se ignora, solo se valida el texto final | mismas funciones | **SIN VERIFICAR** que así lo entregue la API |
| `META_REASONING_EFFORT` (opcional): se envía como `reasoning_effort` (chat) o `reasoning: {effort}` (responses) | `construirPeticion()` | **SIN VERIFICAR** nombre, forma y valores aceptados |

El texto (sin imagen) siempre va por `/chat/completions`; `META_IMAGE_MODE` solo cambia cómo viaja la imagen.

### Farmacias reales del demo: `ACTIVE_PHARMACY_PHONES`

`data/farmacias.json` conserva números falsos (el repo es público). Para el demo con teléfonos reales, **no los escribas en el repo**: ponlos en `.env`:

```
ACTIVE_PHARMACY_PHONES=593XXXXXXXXX,593YYYYYYYYY
```

- Lista separada por comas (se ignoran `+`, espacios y guiones al comparar).
- Si está definida, **solo** esos teléfonos se consultan; todas las demás farmacias del catálogo quedan como `listada`.
- Un teléfono de la lista que **no está** en el catálogo no se consulta y deja un aviso en el log: la farmacia debe existir en la base. Para usar un número real, actualiza el teléfono de esa fila directamente en Postgres (no edites `data/farmacias.json` ni lo commitees con números reales).
- Cada número debe ser destinatario de prueba en Meta (WhatsApp Cloud API), en formato E.164 sin `+`.
- Vacía o sin definir: manda el catálogo.

### Alternativa: `npm run farmacias:demo` (base local)

Pone tus teléfonos en las primeras N farmacias del seed **en tu base local de Postgres**, las deja `activa` y deja el resto `listada`. No toca `data/farmacias.json` ni escribe números en ningún archivo.

```bash
npm run farmacias:demo -- 593XXXXXXXXX 593YYYYYYYYY
```

- Imprime el resultado con los teléfonos **enmascarados** (últimos 4 dígitos), una fila por farmacia.
- Si pasas 2 números, `f1` y `f2` quedan activas con tus números y `f3`–`f5` listadas. Máximo: el número de farmacias del seed (5).
- Si el pedido es inválido (repetidos, formato raro, o un número que ya es de una farmacia que no se va a tocar), **no cambia nada** y dice por qué.
- `npm run db:sembrar` deshace todo y vuelve a poner los números falsos del catálogo.
- Si además defines `ACTIVE_PHARMACY_PHONES`, esa variable manda sobre el estado de la base: usa una o la otra, no las dos.
- Cada número debe ser destinatario de prueba en Meta. Probado aquí solo contra un Postgres local de apt, no contra Docker.

## 2. Pruebas exactas del adaptador (15 min)

Con `RECIPE_PROVIDER=meta`:

```bash
npm run probar:ia -- "Enalapril 10 mg"            # 1. texto simple
npm run probar:ia -- "la pastilla de la presión"  # 2. coloquial: debe venir confidence low y SIN adivinar principio activo
npm run probar:ia -- ruta/receta-sintetica.jpg    # 3. imagen (formato de visión)
```

Anotar para cada una: ¿HTTP 200 (y en qué ruta)? ¿el JSON valida el esquema a la primera o necesitó el reintento de corrección (se ve en el log `salida invalida`)? ¿ms?

Casos a forzar:
- [ ] Imagen: ¿acepta data URI base64 jpeg? ¿y png? ¿tamaño máximo?
- [ ] 401 con key mala (`MODEL_API_KEY=x`): debe fallar rápido con "no reintentable", sin crash.
- [ ] 429: ver el backoff (si se logra provocar; si no, marcar "no probado").
- [ ] Timeout: el límite es 30 s por intento; si la visión tarda más, subir `TIMEOUT_MS` en `meta.ts`.
- [ ] El modelo NO debe recomendar, sustituir ni dosificar (revisar `notes` y todos los campos en las 5 recetas).
- [ ] **Imagen: probar los DOS modos** (`META_IMAGE_MODE=chat` y luego `responses`) con la misma receta; quedarse con el que funcione y anotar cuál.
- [ ] Razonamiento: ¿la respuesta trae bloques de razonamiento? ¿dónde? ¿el adaptador los descartó y validó solo el texto final (sin el log `salida invalida`)? Si el formato difiere, ajustar `textoDeChat`/`textoDeResponses`.
- [ ] `META_REASONING_EFFORT=low` (u otro valor válido): ¿lo acepta la API (sin 400)? ¿baja la latencia? Medir ms con y sin.

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
