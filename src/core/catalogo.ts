import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Farmacia, LecturaMedicamento, SegmentoMercado } from '../types.ts';

/**
 * Se resuelve contra el directorio de trabajo, no contra import.meta.url,
 * para que funcione igual en dev (src/), compilado (dist/) y en el
 * contenedor de Cloud Run (WORKDIR /app).
 */
const datos = (archivo: string): string =>
  join(process.cwd(), 'data', archivo);

const segmentos: SegmentoMercado[] = JSON.parse(
  readFileSync(datos('medicamentos.json'), 'utf8')
);
const farmacias: Farmacia[] = JSON.parse(
  readFileSync(datos('farmacias.json'), 'utf8')
);

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Resuelve la lectura de Gemini a un segmento de mercado.
 * El segmento es la clase de equivalencia definida por la regulacion de precios:
 * mismo principio activo, misma concentracion, misma forma.
 */
export function resolverSegmento(l: LecturaMedicamento): SegmentoMercado | undefined {
  if (!l.encontrado) return undefined;

  const candidatos = [l.principioActivo, l.nombreComercial, l.textoCrudo]
    .filter(Boolean)
    .map((c) => normalizar(c as string));

  for (const seg of segmentos) {
    const claves = [
      seg.principioActivo,
      ...seg.nombresComerciales,
      ...seg.coloquiales,
    ].map(normalizar);

    for (const cand of candidatos) {
      if (claves.some((k) => cand.includes(k) || k.includes(cand))) {
        if (l.concentracion) {
          const conc = normalizar(l.concentracion).replace(/\s/g, '');
          const segConc = normalizar(seg.concentracion).replace(/\s/g, '');
          if (conc && segConc && !conc.includes(segConc) && !segConc.includes(conc)) {
            continue;
          }
        }
        return seg;
      }
    }
  }
  return undefined;
}

export function etiqueta(seg: SegmentoMercado): string {
  return `${seg.principioActivo} ${seg.concentracion}`;
}

export function segmentoPorId(id: string): SegmentoMercado | undefined {
  return segmentos.find((s) => s.id === id);
}

export function farmaciasActivas(): Farmacia[] {
  return farmacias.filter((f) => f.estado !== 'listada');
}

export function farmaciaPorTelefono(telefono: string): Farmacia | undefined {
  const t = telefono.replace(/\D/g, '');
  return farmacias.find((f) => f.telefono.replace(/\D/g, '') === t);
}

export function todasLasFarmacias(): Farmacia[] {
  return farmacias;
}
