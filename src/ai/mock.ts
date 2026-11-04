import type { RecipeExtraction, RecipeReader } from './esquema.ts';

/**
 * Proveedor determinista para probar todo sin llaves ni red.
 * Las imagenes mock llevan en el buffer "MOCK:<nombre-de-fixture>"
 * (asi las genera descargarMedia en WHATSAPP_DRY_RUN con media id "mock:<nombre>").
 */
const FIXTURES: Record<string, RecipeExtraction> = {
  dolex: {
    legible: true,
    medications: [
      { active_ingredient: 'Acetaminofén', dose: '500 mg', form: 'tableta', brand_name: 'Dolex',
        raw_text: 'Dolex 500 mg', confidence: 'high' },
    ],
    notes: null,
  },
  dos_medicamentos: {
    legible: true,
    medications: [
      { active_ingredient: 'Enalapril', dose: '10 mg', form: 'tableta', brand_name: null,
        raw_text: 'Enalapril 10 mg', confidence: 'high' },
      { active_ingredient: 'Metformina', dose: '850 mg', form: 'tableta', brand_name: null,
        raw_text: 'Metformina 850 mg', confidence: 'medium' },
    ],
    notes: null,
  },
  ilegible: { legible: false, medications: [], notes: 'La letra no se alcanza a leer.' },
};

/** Texto -> fixture. Lo que no calce se devuelve como un medicamento "tal cual lo escribio". */
const TEXTOS: { patron: RegExp; fixture: string }[] = [
  { patron: /ilegible|no se lee/i, fixture: 'ilegible' },
  { patron: /enalapril.*metformina|metformina.*enalapril/i, fixture: 'dos_medicamentos' },
];

const COLOQUIAL: RecipeExtraction = {
  legible: true,
  medications: [
    { active_ingredient: 'la pastilla de la presion', dose: null, form: null, brand_name: null,
      raw_text: 'la pastilla de la presion', confidence: 'low' },
  ],
  notes: null,
};

export class MockRecipeReader implements RecipeReader {
  readonly nombre = 'mock' as const;

  async readImage(buf: Buffer, _mime: string): Promise<RecipeExtraction> {
    const m = /^MOCK:([\w-]+)/.exec(buf.subarray(0, 64).toString('utf8'));
    const nombre = m?.[1] ?? 'dolex';
    const fx = FIXTURES[nombre] ?? FIXTURES['dolex']!;
    return structuredClone(fx);
  }

  async readText(texto: string): Promise<RecipeExtraction> {
    for (const t of TEXTOS) {
      if (t.patron.test(texto)) return structuredClone(FIXTURES[t.fixture]!);
    }
    if (/presi[oó]n/i.test(texto)) return structuredClone(COLOQUIAL);
    const limpio = texto.trim();
    if (!limpio) return { legible: false, medications: [], notes: null };
    return {
      legible: true,
      medications: [
        { active_ingredient: limpio, dose: null, form: null, brand_name: null,
          raw_text: limpio, confidence: 'medium' },
      ],
      notes: null,
    };
  }
}

export const NOMBRES_FIXTURE_IMAGEN = Object.keys(FIXTURES);
