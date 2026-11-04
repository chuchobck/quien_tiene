import type { EstadoSolicitud } from '../types.ts';

/**
 * Maquina de estados de una solicitud. Un estado terminal no vuelve a abrirse.
 *
 *   esperando_seleccion ─► esperando_confirmacion ─► consultando ─► resuelta
 *                                                         └──────► sin_resultados
 *   (esperando_seleccion salta a consultando solo pasando por la confirmacion)
 */
export const TRANSICIONES: Record<EstadoSolicitud, EstadoSolicitud[]> = {
  esperando_seleccion: ['esperando_confirmacion'],
  esperando_confirmacion: ['consultando'],
  consultando: ['resuelta', 'sin_resultados'],
  resuelta: [],
  sin_resultados: [],
};

export function puedeTransicionar(de: EstadoSolicitud, a: EstadoSolicitud): boolean {
  return TRANSICIONES[de].includes(a);
}
