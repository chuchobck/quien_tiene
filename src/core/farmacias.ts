import { config } from '../config.ts';
import { store } from '../store/index.ts';
import type { Farmacia } from '../types.ts';
import { log } from '../util/log.ts';

const digitos = (t: string) => t.replace(/\D/g, '');

/**
 * Aplica ACTIVE_PHARMACY_PHONES. Si hay lista: SOLO esos telefonos quedan
 * activos (aunque el catalogo diga otra cosa) y el resto pasa a "listada".
 * Sin lista, el catalogo manda. Funcion pura.
 */
export function aplicarTelefonosActivos(farmacias: Farmacia[], telefonos: string[] | undefined): Farmacia[] {
  if (!telefonos || telefonos.length === 0) return farmacias;
  const permitidos = new Set(telefonos.map(digitos));
  return farmacias.map((f) => ({
    ...f,
    estado: permitidos.has(digitos(f.telefono)) ? (f.estado === 'listada' ? 'activa' : f.estado) : 'listada',
  }));
}

/** Farmacias con la sobreescritura de entorno ya aplicada. */
export async function farmaciasEfectivas(): Promise<Farmacia[]> {
  const todas = await store().farmacias();
  const lista = config.farmaciasActivasTelefonos;
  const efectivas = aplicarTelefonosActivos(todas, lista);
  if (lista && lista.length > 0) {
    const conocidos = new Set(todas.map((f) => digitos(f.telefono)));
    for (const t of lista) {
      if (!conocidos.has(digitos(t))) log.warn(`[farmacias] ACTIVE_PHARMACY_PHONES trae un telefono que no esta en el catalogo: ${t}`);
    }
  }
  return efectivas;
}

export async function farmaciasConsultables(): Promise<Farmacia[]> {
  return (await farmaciasEfectivas()).filter((f) => f.estado !== 'listada');
}
