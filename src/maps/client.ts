import { config } from '../config.ts';
import { log } from '../util/log.ts';

export interface Distancia {
  texto: string;
  metros: number;
}

/**
 * Distancia caminando real, usando el servidor publico de OSRM
 * (OpenStreetMap), sin clave ni costo. Perfil "foot", no "driving".
 *
 * El servidor publico no tiene garantia de actividad, asi que cualquier
 * fallo cae al calculo aproximado. En el Valle de los Chillos la linea
 * recta miente, pero es preferible a que el paciente se quede sin
 * respuesta.
 */
export async function distanciaCaminando(
  origen: { lat: number; lng: number },
  destino: { lat: number; lng: number }
): Promise<Distancia> {
  if (!config.maps.usarOsrm) return aproximada(origen, destino);
  const coords = `${origen.lng},${origen.lat};${destino.lng},${destino.lat}`;
  const url = `https://router.project-osrm.org/route/v1/foot/${coords}?overview=false`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);

    const data = (await res.json()) as {
      code?: string;
      routes?: { distance: number }[];
    };

    if (data.code === 'Ok' && data.routes?.[0]) {
      const metros = Math.round(data.routes[0].distance);
      return formatear(metros);
    }
    throw new Error(`OSRM respondio codigo: ${data.code}`);
  } catch (err) {
    log.warn('[maps] OSRM fallo, uso distancia aproximada', err);
    return aproximada(origen, destino);
  }
}

function formatear(metros: number): Distancia {
  return {
    texto: metros >= 1000 ? `${(metros / 1000).toFixed(1)} km` : `${metros} m`,
    metros,
  };
}

/** Respaldo Haversine, para que el demo nunca se caiga por culpa de OSRM. */
function aproximada(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): Distancia {
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const metros = Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.3);
  return formatear(metros);
}