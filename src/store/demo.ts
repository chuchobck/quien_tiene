import type { Farmacia } from '../types.ts';
import { prisma } from './prisma.ts';

export interface AsignacionDemo {
  id: string;
  nombre: string;
  telefono: string;
  estado: Farmacia['estado'];
  /** true si esta fila recibio uno de los telefonos dados. */
  asignada: boolean;
}

const digitos = (t: string) => t.replace(/\D/g, '');

/** f1, f2, ..., f10: orden natural por el numero, no alfabetico. */
const porId = (a: Farmacia, b: Farmacia) =>
  a.id.localeCompare(b.id, 'en', { numeric: true });

/**
 * Plan puro: los telefonos dados van a las primeras N farmacias (activas); el
 * resto queda listada y conserva su telefono. Lanza Error si el pedido no es valido.
 */
export function planificarFarmaciasDemo(farmacias: Farmacia[], telefonos: string[]): AsignacionDemo[] {
  const nuevos = telefonos.map(digitos);
  if (nuevos.length === 0) throw new Error('Pasa al menos un telefono.');
  for (const [i, t] of nuevos.entries()) {
    if (t.length < 8 || t.length > 15) throw new Error(`Telefono invalido (debe tener entre 8 y 15 digitos): argumento ${i + 1}.`);
  }
  if (new Set(nuevos).size !== nuevos.length) throw new Error('Hay telefonos repetidos en los argumentos.');

  const orden = [...farmacias].sort(porId);
  if (nuevos.length > orden.length) {
    throw new Error(`Pasaste ${nuevos.length} telefonos pero el seed solo tiene ${orden.length} farmacias.`);
  }
  // Un telefono dado no puede coincidir con el de una fila que NO se va a tocar (telefono es unico).
  const intactas = orden.slice(nuevos.length);
  for (const t of nuevos) {
    const choca = intactas.find((f) => digitos(f.telefono) === t);
    if (choca) throw new Error(`Un telefono dado ya pertenece a ${choca.id} (${choca.nombre}), que no se va a modificar.`);
  }

  return orden.map((f, i) =>
    i < nuevos.length
      ? { id: f.id, nombre: f.nombre, telefono: nuevos[i]!, estado: 'activa', asignada: true }
      : { id: f.id, nombre: f.nombre, telefono: digitos(f.telefono), estado: 'listada', asignada: false }
  );
}

/**
 * Aplica el plan en la base LOCAL, en una transaccion. No escribe ningun archivo.
 * (Un `db:sembrar` posterior vuelve a poner los telefonos falsos del catalogo.)
 */
export async function aplicarFarmaciasDemo(telefonos: string[]): Promise<AsignacionDemo[]> {
  const db = prisma();
  const actuales = (await db.pharmacy.findMany()) as Farmacia[];
  const plan = planificarFarmaciasDemo(actuales, telefonos);
  const asignadas = plan.filter((p) => p.asignada);

  await db.$transaction(async (tx) => {
    // Paso 1: telefonos temporales, para que un cruce entre filas (f1 <-> f2) no choque con el unique.
    for (const p of asignadas) await tx.pharmacy.update({ where: { id: p.id }, data: { telefono: `tmp-${p.id}` } });
    for (const p of plan) await tx.pharmacy.update({ where: { id: p.id }, data: { telefono: p.telefono, estado: p.estado } });
  });
  return plan;
}
