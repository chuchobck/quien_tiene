import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorLecturaReceta } from '../src/ai/esquema.ts';
import { MetaRecipeReader, construirPeticion, textoDeChat, textoDeResponses } from '../src/ai/meta.ts';
import { config } from '../src/config.ts';

/**
 * OJO: estas pruebas verifican la LOGICA del adaptador (rutas, modos, reintentos,
 * validacion, descarte de razonamiento) contra un fetch simulado y contra formatos
 * SUPUESTOS. NO prueban que el formato de imagen ni la forma de la respuesta sean
 * los reales de la Meta Model API: eso esta UNVERIFIED hasta probar con la llave
 * (docs/MANANA.md).
 */
const bueno = {
  legible: true,
  medications: [{ active_ingredient: 'Enalapril', dose: '10 mg', form: null, brand_name: null, raw_text: 'Enalapril 10 mg', confidence: 'high' }],
  notes: null,
};
const json = JSON.stringify(bueno);
const chatOk = (content: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const responsesOk = (output: unknown) => new Response(JSON.stringify({ output }), { status: 200 });
const llamada = (f: ReturnType<typeof vi.fn>, i = 0) => {
  const [url, init] = f.mock.calls[i] as unknown as [string, RequestInit];
  return { url, headers: init.headers as Record<string, string>, cuerpo: JSON.parse(init.body as string) };
};

const VARS = ['META_IMAGE_MODE', 'META_REASONING_EFFORT', 'MODEL_API_KEY', 'META_API_KEY', 'META_API_BASE_URL', 'META_MODEL'];
let guardado: Record<string, string | undefined>;
beforeEach(() => { guardado = Object.fromEntries(VARS.map((v) => [v, process.env[v]])); });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const v of VARS) guardado[v] === undefined ? delete process.env[v] : (process.env[v] = guardado[v]);
});

describe('configuracion', () => {
  it('por defecto: api.meta.ai/v1, muse-spark-1.1, modo chat, sin esfuerzo de razonamiento', () => {
    delete process.env.META_API_BASE_URL; delete process.env.META_MODEL;
    delete process.env.META_IMAGE_MODE; delete process.env.META_REASONING_EFFORT;
    expect(config.meta.baseUrl).toBe('https://api.meta.ai/v1');
    expect(config.meta.modelo).toBe('muse-spark-1.1');
    expect(config.meta.modoImagen).toBe('chat');
    expect(config.meta.esfuerzoRazonamiento).toBeUndefined();
  });
  it('MODEL_API_KEY manda y META_API_KEY es alias', () => {
    delete process.env.MODEL_API_KEY; process.env.META_API_KEY = 'alias';
    expect(config.meta.apiKey).toBe('alias');
    process.env.MODEL_API_KEY = 'principal';
    expect(config.meta.apiKey).toBe('principal');
    delete process.env.MODEL_API_KEY; delete process.env.META_API_KEY;
    expect(() => config.meta.apiKey).toThrow(/MODEL_API_KEY/);
  });
  it('META_IMAGE_MODE invalido revienta con mensaje claro', () => {
    process.env.META_IMAGE_MODE = 'otro';
    expect(() => config.meta.modoImagen).toThrow(/META_IMAGE_MODE/);
  });
});

describe('construccion de la peticion', () => {
  const img = 'data:image/jpeg;base64,QUJD';
  it('chat: image_url con data URL en /chat/completions', () => {
    const p = construirPeticion({ texto: 't', imagenDataUrl: img }, 'chat');
    expect(p.ruta).toBe('/chat/completions');
    const user = (p.cuerpo['messages'] as { content: unknown[] }[])[1]!;
    expect(user.content).toContainEqual({ type: 'image_url', image_url: { url: img } });
  });
  it('responses: input_image en /responses con instructions', () => {
    const p = construirPeticion({ texto: 't', imagenDataUrl: img }, 'responses');
    expect(p.ruta).toBe('/responses');
    expect(JSON.stringify(p.cuerpo)).toContain('"type":"input_image"');
    expect(JSON.stringify(p.cuerpo)).toContain(img);
    expect(String(p.cuerpo['instructions'])).toMatch(/NUNCA recomiendes/);
  });
  it('el texto sin imagen siempre va por /chat/completions', () => {
    expect(construirPeticion({ texto: 't' }, 'responses').ruta).toBe('/chat/completions');
  });
  it('META_REASONING_EFFORT se envia solo si esta definido', () => {
    delete process.env.META_REASONING_EFFORT;
    expect(construirPeticion({ texto: 't' }, 'chat').cuerpo).not.toHaveProperty('reasoning_effort');
    process.env.META_REASONING_EFFORT = 'low';
    expect(construirPeticion({ texto: 't' }, 'chat').cuerpo['reasoning_effort']).toBe('low');
    expect(construirPeticion({ texto: 't', imagenDataUrl: img }, 'responses').cuerpo['reasoning']).toEqual({ effort: 'low' });
  });
});

describe('razonamiento aparte: se ignora, solo se valida el texto final', () => {
  it('chat: partes reasoning/thinking descartadas', () => {
    expect(textoDeChat({ choices: [{ message: { content: [
      { type: 'reasoning', text: 'pensando {no json' },
      { type: 'text', text: json },
    ] } }] })).toBe(json);
  });
  it('chat: reasoning_content hermano de content ni se lee', () => {
    expect(textoDeChat({ choices: [{ message: { content: json, reasoning_content: 'basura' } }] })).toBe(json);
  });
  it('chat: <think> inline se elimina', () => {
    expect(textoDeChat({ choices: [{ message: { content: `<think>{x}</think>${json}` } }] })).toBe(json);
  });
  it('responses: item reasoning descartado, output_text del message se usa', () => {
    expect(textoDeResponses({ output: [
      { type: 'reasoning', summary: [{ type: 'summary_text', text: 'hmm' }], content: [{ type: 'reasoning_text', text: 'x' }] },
      { type: 'message', content: [{ type: 'output_text', text: json }] },
    ] })).toBe(json);
  });
  it('responses: acepta el atajo output_text', () => {
    expect(textoDeResponses({ output_text: json })).toBe(json);
  });
  it('respuesta con solo razonamiento = error controlado', () => {
    expect(() => textoDeChat({ choices: [{ message: { content: [{ type: 'reasoning', text: 'x' }] } }] })).toThrow(ErrorLecturaReceta);
    expect(() => textoDeResponses({ output: [{ type: 'reasoning' }] })).toThrow(ErrorLecturaReceta);
  });
});

describe('MetaRecipeReader (fetch simulado)', () => {
  it('texto: POST {base}/chat/completions con Bearer', async () => {
    process.env.MODEL_API_KEY = 'k123';
    const f = vi.fn(async () => chatOk(json));
    vi.stubGlobal('fetch', f);
    const r = await new MetaRecipeReader().readText('enalapril');
    expect(r.legible).toBe(true);
    const c = llamada(f);
    expect(c.url).toBe(`${config.meta.baseUrl}/chat/completions`);
    expect(c.headers['Authorization']).toBe('Bearer k123');
    expect(c.cuerpo.model).toBe('muse-spark-1.1');
  });

  it('imagen en modo chat', async () => {
    process.env.META_IMAGE_MODE = 'chat';
    const f = vi.fn(async () => chatOk(json));
    vi.stubGlobal('fetch', f);
    await new MetaRecipeReader().readImage(Buffer.from('abc'), 'image/jpeg');
    expect(llamada(f).url).toMatch(/\/chat\/completions$/);
    expect(JSON.stringify(llamada(f).cuerpo)).toContain('data:image/jpeg;base64,YWJj');
  });

  it('imagen en modo responses, con razonamiento en la salida', async () => {
    process.env.META_IMAGE_MODE = 'responses';
    const f = vi.fn(async () => responsesOk([
      { type: 'reasoning', content: [{ type: 'reasoning_text', text: '{ruido' }] },
      { type: 'message', content: [{ type: 'output_text', text: json }] },
    ]));
    vi.stubGlobal('fetch', f);
    const r = await new MetaRecipeReader().readImage(Buffer.from('abc'), 'image/png');
    expect(r.medications[0]?.active_ingredient).toBe('Enalapril');
    expect(llamada(f).url).toMatch(/\/responses$/);
    expect(JSON.stringify(llamada(f).cuerpo)).toContain('input_image');
  });

  it('reintenta ante 429 y luego funciona', async () => {
    vi.useFakeTimers();
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '1' } }))
      .mockResolvedValueOnce(chatOk(json));
    vi.stubGlobal('fetch', f);
    const p = new MetaRecipeReader().readText('enalapril');
    await vi.advanceTimersByTimeAsync(2000);
    expect((await p).legible).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('JSON invalido: un reintento pidiendo corregir, y luego funciona', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(chatOk('claro, aqui va: no es json'))
      .mockResolvedValueOnce(chatOk('```json\n' + json + '\n```'));
    vi.stubGlobal('fetch', f);
    expect((await new MetaRecipeReader().readText('enalapril')).legible).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('si sigue invalido, error controlado (no crash)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => chatOk('{"legible": "si"}')));
    await expect(new MetaRecipeReader().readText('x')).rejects.toBeInstanceOf(ErrorLecturaReceta);
  });

  it('401 no se reintenta', async () => {
    const f = vi.fn(async () => new Response('no', { status: 401 }));
    vi.stubGlobal('fetch', f);
    await expect(new MetaRecipeReader().readText('x')).rejects.toBeInstanceOf(ErrorLecturaReceta);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
