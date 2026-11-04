import { config } from '../config.ts';
import { log } from '../util/log.ts';
import { ErrorLecturaReceta, type RecipeExtraction, type RecipeReader } from './esquema.ts';
import { PROMPT_SISTEMA } from './prompt.ts';
import { extraerValidado } from './validar.ts';

/**
 * Adaptador de la Meta Model API.
 *
 * ┌─ PARCIALMENTE UNVERIFIED ───────────────────────────────────────────┐
 * │ Dado por el autor (no comprobado aqui, sin llave todavia):          │
 * │   base https://api.meta.ai/v1 (dev.meta.ai es el portal, no la API),│
 * │   auth "Authorization: Bearer <key>", endpoints compatibles con     │
 * │   OpenAI: POST /chat/completions y POST /responses.                 │
 * │ SIN VERIFICAR contra la documentacion ni una llamada real:          │
 * │   - el formato de la IMAGEN (dos modos, META_IMAGE_MODE):           │
 * │       chat      -> content part `image_url` con data URL base64     │
 * │       responses -> content part `input_image` en /responses         │
 * │   - la forma exacta de la respuesta y de los bloques de razonamiento│
 * │   - META_REASONING_EFFORT (nombre/forma del parametro)              │
 * │ Pruebas pendientes con la llave: docs/MANANA.md.                    │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * El TEXTO siempre va por /chat/completions; META_IMAGE_MODE solo decide
 * como viaja la imagen. Si la respuesta trae razonamiento aparte, se ignora:
 * solo se valida el texto final.
 */

const INTENTOS = 3;
const TIMEOUT_MS = 30_000;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Json = Record<string, unknown>;

/** Quita bloques <think>…</think> por si el razonamiento viene inline en el texto. */
function sinRazonamientoInline(t: string): string {
  return t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/** Une SOLO partes de texto final; descarta cualquier parte de razonamiento. */
function textoDePartes(partes: unknown[]): string {
  return partes
    .map((p) => {
      if (typeof p !== 'object' || p === null) return '';
      const o = p as { type?: unknown; text?: unknown };
      const tipo = typeof o.type === 'string' ? o.type : 'text';
      if (tipo !== 'text' && tipo !== 'output_text') return ''; // reasoning, thinking, etc.
      return typeof o.text === 'string' ? o.text : '';
    })
    .join('');
}

/** Respuesta de /chat/completions: choices[0].message.content (reasoning_content y similares no se leen). */
export function textoDeChat(data: unknown): string {
  const contenido = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  const t =
    typeof contenido === 'string' ? contenido : Array.isArray(contenido) ? textoDePartes(contenido) : '';
  const limpio = sinRazonamientoInline(t);
  if (!limpio) throw new ErrorLecturaReceta('Meta Model API (chat): respuesta sin texto final (formato inesperado)');
  return limpio;
}

/** Respuesta de /responses: output_text, o los items type "message" (los "reasoning" se descartan). */
export function textoDeResponses(data: unknown): string {
  const d = data as { output_text?: unknown; output?: unknown };
  let t = typeof d?.output_text === 'string' ? d.output_text : '';
  if (!t.trim() && Array.isArray(d?.output)) {
    t = d.output
      .map((item) => {
        const it = item as { type?: unknown; content?: unknown };
        if (it?.type !== 'message' || !Array.isArray(it.content)) return '';
        return textoDePartes(it.content);
      })
      .join('');
  }
  const limpio = sinRazonamientoInline(t);
  if (!limpio) throw new ErrorLecturaReceta('Meta Model API (responses): respuesta sin texto final (formato inesperado)');
  return limpio;
}

type Entrada = { texto: string; imagenDataUrl?: string };

interface Peticion {
  ruta: '/chat/completions' | '/responses';
  cuerpo: Json;
  leer: (data: unknown) => string;
}

export function construirPeticion(e: Entrada, modo: 'chat' | 'responses' = config.meta.modoImagen): Peticion {
  const esfuerzo = config.meta.esfuerzoRazonamiento;
  const usarResponses = modo === 'responses' && e.imagenDataUrl !== undefined;

  if (usarResponses) {
    const cuerpo: Json = {
      model: config.meta.modelo,
      instructions: PROMPT_SISTEMA,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: e.texto },
            { type: 'input_image', image_url: e.imagenDataUrl },
          ],
        },
      ],
    };
    if (esfuerzo) cuerpo['reasoning'] = { effort: esfuerzo };
    return { ruta: '/responses', cuerpo, leer: textoDeResponses };
  }

  const contenido: Json[] = [{ type: 'text', text: e.texto }];
  if (e.imagenDataUrl) contenido.push({ type: 'image_url', image_url: { url: e.imagenDataUrl } });
  const cuerpo: Json = {
    model: config.meta.modelo,
    temperature: 0.1,
    messages: [
      { role: 'system', content: PROMPT_SISTEMA },
      { role: 'user', content: contenido },
    ],
  };
  if (esfuerzo) cuerpo['reasoning_effort'] = esfuerzo;
  return { ruta: '/chat/completions', cuerpo, leer: textoDeChat };
}

/** Una llamada con timeout y reintento con backoff ante 429, 5xx y fallos de red. */
async function llamar(e: Entrada): Promise<string> {
  const { ruta, cuerpo, leer } = construirPeticion(e);
  const url = `${config.meta.baseUrl}${ruta}`;

  let ultimo = 'sin intentos';
  for (let intento = 1; intento <= INTENTOS; intento++) {
    let espera = 1000 * 2 ** (intento - 1);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.meta.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return leer(await res.json());

      ultimo = `HTTP ${res.status}`;
      if (!(res.status === 429 || res.status >= 500)) {
        // 400/401/403/404: no se arregla reintentando. El cuerpo no se vuelca (puede ser largo).
        throw new ErrorLecturaReceta(`Meta Model API ${res.status} en ${ruta} (no reintentable)`);
      }
      const ra = Number(res.headers.get('retry-after'));
      if (Number.isFinite(ra) && ra > 0) espera = Math.min(ra * 1000, 10_000);
    } catch (err) {
      if (err instanceof ErrorLecturaReceta) throw err;
      ultimo = err instanceof Error ? err.message : String(err);
    }
    if (intento < INTENTOS) {
      log.warn(`[ia:meta] intento ${intento} fallo (${ultimo}), reintento en ${espera}ms`);
      await esperar(espera);
    }
  }
  throw new ErrorLecturaReceta(`Meta Model API agoto los reintentos (${ultimo})`);
}

export class MetaRecipeReader implements RecipeReader {
  readonly nombre = 'meta' as const;

  readImage(buf: Buffer, mime: string): Promise<RecipeExtraction> {
    const imagenDataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    return extraerValidado('meta', (correccion) =>
      llamar({ texto: correccion ?? 'Transcribe los medicamentos de esta receta.', imagenDataUrl })
    );
  }

  readText(texto: string): Promise<RecipeExtraction> {
    return extraerValidado('meta', (correccion) =>
      llamar({ texto: `${correccion ? correccion + '\n\n' : ''}Texto del paciente: "${texto}"` })
    );
  }
}
