import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import { cerrarPrisma, crearStorePrisma, prisma } from '../src/store/prisma.ts';
import { aplicarFarmaciasDemo } from '../src/store/demo.ts';
import { sembrarCatalogo } from '../src/store/sembrar.ts';

/** Integracion con PostgreSQL real. Si no hay base alcanzable, se omite (y se dice en el reporte). */
async function hayBase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma().$queryRaw`select 1`;
    return true;
  } catch {
    return false;
  }
}
const ok = await hayBase();
afterAll(cerrarPrisma);

describe.skipIf(!ok)('Store sobre PostgreSQL (Prisma)', () => {
  const s = crearStorePrisma();

  it('siembra idempotente y lee catalogo y farmacias', async () => {
    await sembrarCatalogo();
    await sembrarCatalogo();
    expect((await s.segmentos()).length).toBe(16);
    expect((await s.farmacias()).filter((f) => f.estado === 'activa')).toHaveLength(3);
    expect((await s.farmaciaPorTelefono('+593 980000001'))?.id).toBe('f1');
  });

  it('InboundMessage: el unique deduplica por message.id', async () => {
    const id = `wamid.test-${Date.now()}`;
    expect(await s.registrarEntrante(id, 'text')).toBe(true);
    expect(await s.registrarEntrante(id, 'text')).toBe(false);
    await s.olvidarEntrante(id);
    expect(await s.registrarEntrante(id, 'text')).toBe(true);
    await s.olvidarEntrante(id);
  });

  it('solicitud + consultas + transicion atomica + demanda agregada', async () => {
    const id = `t${Date.now() % 1e9}`;
    await s.crearSolicitud({ id, telefonoPaciente: '593990009999', segmentoId: 'enalapril-10-tab', estado: 'consultando', creadaEn: Date.now(), lat: 0, lng: 0 });
    await s.crearConsulta(id, { farmaciaId: 'f1', enviadaEn: Date.now(), respuesta: 'sin_respuesta', abierta: true });
    await s.actualizarConsulta(id, 'f1', { respuesta: 'no_tengo', abierta: false, respondidaEn: Date.now() });
    expect(await s.transicionar(id, 'consultando', 'sin_resultados')).toBe(true);
    expect(await s.transicionar(id, 'consultando', 'sin_resultados')).toBe(false);
    const d = await s.demandaDeFarmacia('f1', Date.now() - 60_000);
    const fila = d.find((x) => x.segmentoId === 'enalapril-10-tab');
    expect(fila?.noTenia).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(d)).not.toContain('593990009999'); // la demanda no identifica al paciente
    await prisma().pharmacyQuery.deleteMany({ where: { solicitudId: id } });
    await prisma().searchRequest.delete({ where: { id } });
  });

  it('ultimaConsultaDeFarmacia devuelve la mas reciente aunque ya este cerrada', async () => {
    const id = `u${Date.now() % 1e9}`;
    await s.crearSolicitud({ id, telefonoPaciente: '593990008888', segmentoId: 'enalapril-10-tab', estado: 'consultando', creadaEn: Date.now(), lat: 0, lng: 0 });
    await s.crearConsulta(id, { farmaciaId: 'f3', enviadaEn: Date.now() + 5000, respuesta: 'sin_respuesta', abierta: true });
    expect((await s.ultimaConsultaDeFarmacia('f3'))?.id).toBe(id);
    await s.transicionar(id, 'consultando', 'sin_resultados');
    await s.actualizarConsulta(id, 'f3', { abierta: false });
    expect(await s.solicitudAbiertaDeFarmacia('f3')).toBeUndefined();
    const u = await s.ultimaConsultaDeFarmacia('f3');
    expect(u?.id).toBe(id);
    expect(u?.estado).toBe('sin_resultados');
    await prisma().pharmacyQuery.deleteMany({ where: { solicitudId: id } });
    await prisma().searchRequest.delete({ where: { id } });
  });

  it('farmacias:demo en la base: asigna, deja el resto listada y es reversible con el seed', async () => {
    await sembrarCatalogo();
    try {
      const plan = await aplicarFarmaciasDemo(['593990000111', '593980000001']); // cruza con el telefono de f1
      expect(plan.filter((p) => p.estado === 'activa')).toHaveLength(2);
      const f = await s.farmacias();
      expect(f.find((x) => x.id === 'f1')?.telefono).toBe('593990000111');
      expect(f.find((x) => x.id === 'f2')?.telefono).toBe('593980000001');
      expect(f.filter((x) => x.estado === 'activa').map((x) => x.id)).toEqual(['f1', 'f2']);
      await expect(aplicarFarmaciasDemo(['593980000005'])).rejects.toThrow(/ya pertenece/);
      // El pedido invalido no cambio nada.
      expect((await s.farmacias()).find((x) => x.id === 'f1')?.telefono).toBe('593990000111');
    } finally {
      await sembrarCatalogo(); // deja la base como el seed
    }
    expect((await s.farmacias()).filter((x) => x.estado === 'activa')).toHaveLength(3);
  });
});
