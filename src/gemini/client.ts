import { log } from '../util/log.ts';
import { config } from '../config.ts';
import type { LecturaMedicamento } from '../types.ts';
import { PROMPT_LECTURA } from './prompts.ts';

interface ParteGemini {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

async function generar(partes: ParteGemini[]): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${config.gemini.modelo}:generateContent?key=${config.gemini.apiKey}`;

  const intentos = 3;

  for (let intento = 1; intento <= intentos; intento++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    // 503 (saturado) y 429 (rate limit) valen la pena reintentar.
    // Cualquier otro error (401, 400) no se arregla reintentando.
    const esTransitorio = res.status === 503 || res.status === 429;
    const quedanIntentos = intento < intentos;

    if (!esTransitorio || !quedanIntentos) {
      const detalle = await res.text();
      throw new Error(`Gemini ${res.status}: ${detalle}`);
    }

    const espera = 1500 * intento;
    log.error(`[gemini] intento ${intento} fallo (${res.status}), reintento en ${espera}ms`);
    await new Promise((r) => setTimeout(r, espera));
  }

  throw new Error('Gemini agoto los reintentos');
}

function parsear(crudo: string): LecturaMedicamento {
  const limpio = crudo.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    const obj = JSON.parse(limpio) as Partial<LecturaMedicamento>;
    return {
      encontrado: Boolean(obj.encontrado),
      principioActivo: obj.principioActivo ?? undefined,
      concentracion: obj.concentracion ?? undefined,
      forma: obj.forma ?? undefined,
      nombreComercial: obj.nombreComercial ?? undefined,
      textoCrudo: obj.textoCrudo ?? undefined,
      confianza: obj.confianza ?? 'baja',
    };
  } catch {
    return { encontrado: false, confianza: 'baja', textoCrudo: limpio.slice(0, 200) };
  }
}

/** Lee una foto de receta. */
export async function leerReceta(
  base64: string,
  mimeType: string
): Promise<LecturaMedicamento> {
  const crudo = await generar([
    { text: PROMPT_LECTURA },
    { inline_data: { mime_type: mimeType, data: base64 } },
  ]);
  return parsear(crudo);
}

/** Interpreta texto escrito por el paciente, incluido lenguaje coloquial. */
export async function leerTexto(texto: string): Promise<LecturaMedicamento> {
  const crudo = await generar([
    { text: PROMPT_LECTURA },
    { text: `Texto del paciente: "${texto}"` },
  ]);
  return parsear(crudo);
}
