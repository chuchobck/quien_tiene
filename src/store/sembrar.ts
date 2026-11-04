import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Farmacia, SegmentoMercado } from '../types.ts';
import { prisma } from './prisma.ts';

/** Carga data/*.json en la base. Idempotente: se puede correr las veces que haga falta. */
export async function sembrarCatalogo(): Promise<{ segmentos: number; farmacias: number }> {
  const leer = <T>(a: string): T => JSON.parse(readFileSync(join(process.cwd(), 'data', a), 'utf8')) as T;
  const segmentos = leer<SegmentoMercado[]>('medicamentos.json');
  const farmacias = leer<Farmacia[]>('farmacias.json');
  const db = prisma();

  for (const s of segmentos) {
    await db.medicineSegment.upsert({ where: { id: s.id }, update: s, create: s });
  }
  const destino = farmacias.map((f) => ({ ...f, telefono: f.telefono.replace(/\D/g, '') }));
  await db.$transaction(async (tx) => {
    // El telefono es unico: si dos filas se intercambiaron (p. ej. tras farmacias:demo), restaurar una
    // por una chocaria. Primero se aparta temporalmente toda fila cuyo telefono va a cambiar.
    const existentes = await tx.pharmacy.findMany({ select: { id: true, telefono: true } });
    for (const e of existentes) {
      const d = destino.find((x) => x.id === e.id);
      if (d && d.telefono !== e.telefono) await tx.pharmacy.update({ where: { id: e.id }, data: { telefono: `tmp-${e.id}` } });
    }
    for (const d of destino) await tx.pharmacy.upsert({ where: { id: d.id }, update: d, create: d });
  });
  return { segmentos: segmentos.length, farmacias: farmacias.length };
}
