import { ErrorLecturaReceta, RecipeExtractionSchema, type RecipeExtraction } from './esquema.ts';
import { PROMPT_CORRECCION } from './prompt.ts';
import { log } from '../util/log.ts';

function parsearJson(crudo: string): unknown {
  const limpio = crudo.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(limpio);
  } catch {
    // Algunos modelos anteponen texto: se intenta rescatar el primer objeto {...}.
    const ini = limpio.indexOf('{');
    const fin = limpio.lastIndexOf('}');
    if (ini >= 0 && fin > ini) return JSON.parse(limpio.slice(ini, fin + 1));
    throw new Error('la respuesta no es JSON');
  }
}

/**
 * Valida la salida del modelo con zod. Si no valida, UN reintento pidiendo
 * corregirlo; si sigue mal, error controlado (nunca un crash ni un dato a medias).
 */
export async function extraerValidado(
  proveedor: string,
  llamar: (correccion?: string) => Promise<string>
): Promise<RecipeExtraction> {
  let ultimoError = '';
  for (let intento = 0; intento < 2; intento++) {
    const crudo = await llamar(intento === 0 ? undefined : PROMPT_CORRECCION + ultimoError);
    try {
      const resultado = RecipeExtractionSchema.safeParse(parsearJson(crudo));
      if (resultado.success) return resultado.data;
      ultimoError = resultado.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
    } catch (err) {
      ultimoError = err instanceof Error ? err.message : String(err);
    }
    log.warn(`[ia:${proveedor}] salida invalida (intento ${intento + 1}): ${ultimoError}`);
  }
  throw new ErrorLecturaReceta(`${proveedor}: la salida no valida contra el esquema: ${ultimoError}`);
}
