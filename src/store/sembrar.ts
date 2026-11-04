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
  for (const f of farmacias) {
    const datos = { ...f, telefono: f.telefono.replace(/\D/g, '') };
    await db.pharmacy.upsert({ where: { id: f.id }, update: datos, create: datos });
  }
  return { segmentos: segmentos.length, farmacias: farmacias.length };
}
