import { log } from '../util/log.ts';
import { config } from '../config.ts';

export interface ParteGemini {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

/**
 * Llamada cruda a Gemini (prototipo del DevFest). No sabe nada de recetas:
 * recibe partes y devuelve el texto. Reintenta 503 (saturado) y 429 (limite).
 */
export async function generar(partes: ParteGemini[]): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${config.gemini.modelo}:generateContent?key=${config.gemini.apiKey}`;

  const intentos = 3;

  for (let intento = 1; intento <= intentos; intento++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: partes }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const texto = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!texto) throw new Error('Gemini no devolvio texto');
      return texto;
    }

    const esTransitorio = res.status === 503 || res.status === 429;
    if (!esTransitorio || intento === intentos) {
      // No se vuelca el cuerpo completo: puede repetir la URL con la llave.
      throw new Error(`Gemini ${res.status}`);
    }

    const espera = 1500 * intento;
    log.error(`[gemini] intento ${intento} fallo (${res.status}), reintento en ${espera}ms`);
    await new Promise((r) => setTimeout(r, espera));
  }

  throw new Error('Gemini agoto los reintentos');
}
