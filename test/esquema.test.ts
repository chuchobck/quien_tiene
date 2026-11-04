import { describe, expect, it } from 'vitest';
import { RecipeExtractionSchema } from '../src/ai/esquema.ts';
import { MockRecipeReader } from '../src/ai/mock.ts';

const valido = {
  legible: true,
  medications: [
    { active_ingredient: 'Enalapril', dose: '10 mg', form: null, brand_name: null, raw_text: 'Enalapril 10', confidence: 'high' },
  ],
  notes: null,
};

describe('esquema RecipeExtraction', () => {
  it('acepta una extraccion valida', () => {
    expect(RecipeExtractionSchema.safeParse(valido).success).toBe(true);
  });
  it('rechaza confianza fuera del enum', () => {
    const malo = structuredClone(valido);
    (malo.medications[0] as { confidence: string }).confidence = 'alta';
    expect(RecipeExtractionSchema.safeParse(malo).success).toBe(false);
  });
  it('rechaza campos extra (strict) y faltantes', () => {
    expect(RecipeExtractionSchema.safeParse({ ...valido, recomendacion: 'tomar 2' }).success).toBe(false);
    expect(RecipeExtractionSchema.safeParse({ legible: true, medications: [] }).success).toBe(false);
  });
  it('rechaza principio activo vacio', () => {
    const malo = structuredClone(valido);
    malo.medications[0]!.active_ingredient = '';
    expect(RecipeExtractionSchema.safeParse(malo).success).toBe(false);
  });
});

describe('proveedor mock: sus fixtures cumplen el esquema', () => {
  const mock = new MockRecipeReader();
  it.each(['dolex', 'dos_medicamentos', 'ilegible'])('imagen %s', async (n) => {
    const r = await mock.readImage(Buffer.from(`MOCK:${n}`), 'image/x-mock');
    expect(RecipeExtractionSchema.safeParse(r).success).toBe(true);
  });
  it('caso ilegible, dos medicamentos y coloquial', async () => {
    expect((await mock.readImage(Buffer.from('MOCK:ilegible'), 'x')).legible).toBe(false);
    expect((await mock.readImage(Buffer.from('MOCK:dos_medicamentos'), 'x')).medications).toHaveLength(2);
    const c = await mock.readText('la pastilla de la presión');
    expect(c.medications[0]?.confidence).toBe('low');
    expect(RecipeExtractionSchema.safeParse(c).success).toBe(true);
  });
});
