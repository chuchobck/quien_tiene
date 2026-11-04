import { generar } from '../gemini/client.ts';
import { PROMPT_SISTEMA } from './prompt.ts';
import { extraerValidado } from './validar.ts';
import type { RecipeExtraction, RecipeReader } from './esquema.ts';

/** Adaptador de Gemini a la interfaz RecipeReader. Es el cliente del prototipo del DevFest. */
export class GeminiRecipeReader implements RecipeReader {
  readonly nombre = 'gemini' as const;

  readImage(buf: Buffer, mime: string): Promise<RecipeExtraction> {
    return extraerValidado('gemini', (correccion) =>
      generar([
        { text: PROMPT_SISTEMA + (correccion ? `\n\n${correccion}` : '') },
        { inline_data: { mime_type: mime, data: buf.toString('base64') } },
      ])
    );
  }

  readText(texto: string): Promise<RecipeExtraction> {
    return extraerValidado('gemini', (correccion) =>
      generar([
        { text: PROMPT_SISTEMA + (correccion ? `\n\n${correccion}` : '') },
        { text: `Texto del paciente: "${texto}"` },
      ])
    );
  }
}
