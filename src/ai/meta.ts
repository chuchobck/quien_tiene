import { config } from '../config.ts';
import { log } from '../util/log.ts';
import { ErrorLecturaReceta, type RecipeExtraction, type RecipeReader } from './esquema.ts';
import { PROMPT_SISTEMA } from './prompt.ts';
import { extraerValidado } from './validar.ts';

/**
 * Adaptador de la Meta Model API.
 *
 * ┌─ UNVERIFIED ────────────────────────────────────────────────────────┐
 * │ Se escribio SIN acceso a la documentacion oficial ni a una llave:   │
 * │ desde el entorno de construccion no resolvian dev.meta.ai ni        │
 * │ ai.developer.meta.com. Lo que sigue es una SUPOSICION basada en     │
 * │ fragmentos de terceros: API estilo OpenAI Chat Completions,         │
 * │ auth "Authorization: Bearer", imagen como content part `image_url`  │
 * │ con data URI, respuesta en choices[0].message.content.              │
 * │ Pendiente de probar con la llave real: docs/MANANA.md.              │
 * │ Base URL, ruta, modelo y modo JSON son configurables por env.       │
 * └─────────────────────────────────────────────────────────────────────┘
 */

type ParteContenido =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

const INTENTOS = 3;
const TIMEOUT_MS = 30_000;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extraerTexto(data: unknown): string {
  const choices = (data as { choices?: { message?: { content?: unknown } }[] })?.choices;
  const contenido = choices?.[0]?.message?.content;
  if (typeof contenido === 'string' && contenido.trim()) return contenido;
  if (Array.isArray(contenido)) {
    const t = contenido
      .map((p) => (typeof p === 'object' && p !== null ? (p as { text?: unknown }).text : undefined))
      .filter((x): x is string => typeof x === 'string')
      .join('');
    if (t.trim()) return t;
  }
  throw new ErrorLecturaReceta('Meta Model API: respuesta sin texto (formato inesperado)');
}

/** Una llamada con timeout y reintento con backoff ante 429, 5xx y fallos de red. */
async function llamar(usuario: ParteContenido[]): Promise<string> {
  const url = `${config.meta.baseUrl}${config.meta.rutaChat}`;
  const cuerpo: Record<string, unknown> = {
    model: config.meta.modelo,
    temperature: 0.1,
    messages: [
      { role: 'system', content: PROMPT_SISTEMA },
      { role: 'user', content: usuario },
    ],
  };
  if (config.meta.modoJson) cuerpo['response_format'] = { type: 'json_object' };

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
      if (res.ok) return extraerTexto(await res.json());

      ultimo = `HTTP ${res.status}`;
      const transitorio = res.status === 429 || res.status >= 500;
      if (!transitorio) {
        // 400/401/403/404: no se arregla reintentando. El cuerpo no se vuelca (puede ser largo).
        throw new ErrorLecturaReceta(`Meta Model API ${res.status} (no reintentable)`);
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
    const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
    return extraerValidado('meta', (correccion) =>
      llamar([
        { type: 'text', text: correccion ?? 'Transcribe los medicamentos de esta receta.' },
        { type: 'image_url', image_url: { url: dataUri } },
      ])
    );
  }

  readText(texto: string): Promise<RecipeExtraction> {
    return extraerValidado('meta', (correccion) =>
      llamar([{ type: 'text', text: `${correccion ? correccion + '\n\n' : ''}Texto del paciente: "${texto}"` }])
    );
  }
}
