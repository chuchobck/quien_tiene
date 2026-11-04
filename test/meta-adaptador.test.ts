import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorLecturaReceta } from '../src/ai/esquema.ts';
import { MetaRecipeReader } from '../src/ai/meta.ts';

/**
 * OJO: estas pruebas verifican la LOGICA del adaptador (reintentos, validacion,
 * errores controlados) contra un fetch simulado. NO prueban que el formato de
 * request/response sea el real de la Meta Model API: eso esta UNVERIFIED hasta
 * probar con la llave (docs/MANANA.md).
 */
const bueno = {
  legible: true,
  medications: [{ active_ingredient: 'Enalapril', dose: '10 mg', form: null, brand_name: null, raw_text: 'Enalapril 10 mg', confidence: 'high' }],
  notes: null,
};
const ok = (contenido: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: contenido } }] }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('MetaRecipeReader (fetch simulado)', () => {
  it('lee una respuesta valida y manda la imagen como data URI', async () => {
    const f = vi.fn(async () => ok(JSON.stringify(bueno)));
    vi.stubGlobal('fetch', f);
    const r = await new MetaRecipeReader().readImage(Buffer.from('abc'), 'image/jpeg');
    expect(r.medications[0]?.active_ingredient).toBe('Enalapril');
    const cuerpo = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(JSON.stringify(cuerpo)).toContain('data:image/jpeg;base64,');
    expect(cuerpo.messages[0].content).toMatch(/NUNCA recomiendes/);
  });

  it('reintenta ante 429 y luego funciona', async () => {
    vi.useFakeTimers();
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '1' } }))
      .mockResolvedValueOnce(ok(JSON.stringify(bueno)));
    vi.stubGlobal('fetch', f);
    const p = new MetaRecipeReader().readText('enalapril');
    await vi.advanceTimersByTimeAsync(2000);
    expect((await p).legible).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('JSON invalido: un reintento pidiendo corregir, y luego funciona', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(ok('claro, aqui va: no es json'))
      .mockResolvedValueOnce(ok('```json\n' + JSON.stringify(bueno) + '\n```'));
    vi.stubGlobal('fetch', f);
    const r = await new MetaRecipeReader().readText('enalapril');
    expect(r.legible).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('si sigue invalido, error controlado (no crash)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok('{"legible": "si"}')));
    await expect(new MetaRecipeReader().readText('x')).rejects.toBeInstanceOf(ErrorLecturaReceta);
  });

  it('401 no se reintenta', async () => {
    const f = vi.fn(async () => new Response('no', { status: 401 }));
    vi.stubGlobal('fetch', f);
    await expect(new MetaRecipeReader().readText('x')).rejects.toBeInstanceOf(ErrorLecturaReceta);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
