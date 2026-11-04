import { config } from '../config.ts';
import type { RecipeReader } from './esquema.ts';
import { GeminiRecipeReader } from './gemini.ts';
import { MetaRecipeReader } from './meta.ts';
import { MockRecipeReader } from './mock.ts';

export * from './esquema.ts';

let lector: RecipeReader | undefined;

/** Proveedor elegido por RECIPE_PROVIDER. Se crea una sola vez. */
export function lectorDeRecetas(): RecipeReader {
  if (!lector) {
    const p = config.recetas.proveedor;
    lector = p === 'meta' ? new MetaRecipeReader() : p === 'gemini' ? new GeminiRecipeReader() : new MockRecipeReader();
  }
  return lector;
}

/** Solo para pruebas. */
export function fijarLector(l: RecipeReader | undefined): void {
  lector = l;
}
