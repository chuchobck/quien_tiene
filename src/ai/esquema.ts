import { z } from 'zod';

/** Un medicamento tal como esta escrito en la receta o en el mensaje. */
export const MedicamentoSchema = z.object({
  active_ingredient: z.string().min(1),
  dose: z.string().nullable(),
  form: z.string().nullable(),
  brand_name: z.string().nullable(),
  raw_text: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const RecipeExtractionSchema = z
  .object({
    legible: z.boolean(),
    medications: z.array(MedicamentoSchema),
    notes: z.string().nullable(),
  })
  .strict();

export type Medicamento = z.infer<typeof MedicamentoSchema>;
export type RecipeExtraction = z.infer<typeof RecipeExtractionSchema>;

/** Interfaz unica que el resto del sistema conoce. Cada proveedor la implementa. */
export interface RecipeReader {
  readonly nombre: 'mock' | 'gemini' | 'meta';
  readImage(buf: Buffer, mime: string): Promise<RecipeExtraction>;
  readText(texto: string): Promise<RecipeExtraction>;
}

/** Error controlado: la lectura fallo de forma esperable (red, JSON invalido tras reintento). */
export class ErrorLecturaReceta extends Error {
  constructor(mensaje: string, readonly causa?: unknown) {
    super(mensaje);
    this.name = 'ErrorLecturaReceta';
  }
}
