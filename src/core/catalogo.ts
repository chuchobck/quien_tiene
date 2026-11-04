import type { Medicamento } from '../ai/esquema.ts';
import type { SegmentoMercado } from '../types.ts';

export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

const sinEspacios = (s: string) => normalizar(s).replace(/\s/g, '');

/** Puntaje de calce entre un texto del paciente y una clave del segmento. 0 = no calza. */
function puntaje(texto: string, clave: string): number {
  if (!texto || !clave) return 0;
  if (texto === clave) return 1000;
  // El texto contiene la clave completa ("dolex 500 mg" contiene "dolex").
  if (new RegExp(`(^|\\W)${clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`).test(texto)) {
    return clave.length;
  }
  return 0;
}

/**
 * Resuelve una medicacion leida al segmento de mercado (principio activo +
 * concentracion + forma). Devuelve TODOS los segmentos empatados en el mejor
 * puntaje: si es ambiguo ("pastilla de la presion" sin mas), el orquestador
 * deja que el paciente elija. Nunca elegimos por el.
 */
export function resolverSegmentos(m: Medicamento, segmentos: SegmentoMercado[]): SegmentoMercado[] {
  const textos = [m.active_ingredient, m.brand_name, m.raw_text]
    .filter((t): t is string => Boolean(t))
    .map(normalizar);

  const puntuados: { seg: SegmentoMercado; p: number }[] = [];
  for (const seg of segmentos) {
    // Si la receta trae concentracion y no calza con el segmento, no es este.
    if (m.dose) {
      const d = sinEspacios(m.dose);
      const c = sinEspacios(seg.concentracion);
      if (d && c && !d.includes(c) && !c.includes(d)) continue;
    }
    const claves = [seg.principioActivo, ...seg.nombresComerciales, ...seg.coloquiales].map(normalizar);
    let mejor = 0;
    for (const t of textos) for (const k of claves) mejor = Math.max(mejor, puntaje(t, k));
    if (mejor > 0) puntuados.push({ seg, p: mejor });
  }

  if (puntuados.length === 0) return [];
  const max = Math.max(...puntuados.map((x) => x.p));
  return puntuados.filter((x) => x.p === max).map((x) => x.seg);
}

export function etiqueta(seg: SegmentoMercado): string {
  return `${seg.principioActivo} ${seg.concentracion}`;
}

/**
 * Nombre que ve el PACIENTE: siempre lo que el mismo escribio o lo que decia
 * su receta (marca, principio activo, tal cual). Nunca el nombre "resuelto"
 * del catalogo (no ve "Paracetamol" si puso "Dolex"). El nombre del catalogo
 * se usa aparte, solo para preguntarle a la FARMACIA.
 */
export function nombreParaPaciente(m: Medicamento): string {
  const detalle = [m.active_ingredient, m.dose].filter(Boolean).join(' ');
  if (m.brand_name) return detalle ? `${m.brand_name} (${detalle})` : m.brand_name;
  return detalle || m.raw_text;
}
