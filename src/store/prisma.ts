import { PrismaClient, type Prisma } from '@prisma/client';
import type { ConsultaFarmacia, Farmacia, OpcionMedicamento, SegmentoMercado, Solicitud } from '../types.ts';
import type { FilaDemanda, Store } from './tipos.ts';

let cliente: PrismaClient | undefined;

/** Cliente unico. Solo este archivo y sembrar.ts lo tocan. */
export function prisma(): PrismaClient {
  cliente ??= new PrismaClient();
  return cliente;
}

export async function cerrarPrisma(): Promise<void> {
  await cliente?.$disconnect();
  cliente = undefined;
}

type FilaSolicitud = Prisma.SearchRequestGetPayload<{ include: { consultas: true } }>;

function aSolicitud(r: FilaSolicitud): Solicitud {
  return {
    id: r.id,
    telefonoPaciente: r.telefonoPaciente,
    segmentoId: r.segmentoId ?? undefined,
    textoDetectado: r.textoDetectado ?? undefined,
    opciones: (r.opciones as OpcionMedicamento[] | null) ?? undefined,
    estado: r.estado,
    creadaEn: r.creadaEn.getTime(),
    lat: r.lat,
    lng: r.lng,
    consultas: r.consultas.map((c): ConsultaFarmacia => ({
      farmaciaId: c.farmaciaId,
      enviadaEn: c.enviadaEn.getTime(),
      respondidaEn: c.respondidaEn?.getTime(),
      respuesta: c.respuesta,
      precio: c.precio ?? undefined,
      distanciaTexto: c.distanciaTexto ?? undefined,
      distanciaMetros: c.distanciaMetros ?? undefined,
      abierta: c.abierta,
    })),
  };
}

const digitos = (t: string) => t.replace(/\D/g, '');

export function crearStorePrisma(): Store {
  const db = prisma;
  return {
    async segmentos() {
      return (await db().medicineSegment.findMany()) as SegmentoMercado[];
    },
    async farmacias() {
      return (await db().pharmacy.findMany({ orderBy: { id: 'asc' } })) as Farmacia[];
    },
    async farmaciaPorTelefono(t) {
      const f = await db().pharmacy.findUnique({ where: { telefono: digitos(t) } });
      return (f ?? undefined) as Farmacia | undefined;
    },
    async farmaciaPorId(id) {
      return ((await db().pharmacy.findUnique({ where: { id } })) ?? undefined) as Farmacia | undefined;
    },

    async registrarEntrante(id, tipo) {
      try {
        await db().inboundMessage.create({ data: { id, tipo } });
        return true;
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002') return false; // unique: ya visto
        throw err;
      }
    },
    async olvidarEntrante(id) {
      await db().inboundMessage.deleteMany({ where: { id } });
    },

    async crearSolicitud(s) {
      await db().searchRequest.create({
        data: {
          id: s.id,
          telefonoPaciente: s.telefonoPaciente,
          segmentoId: s.segmentoId ?? null,
          textoDetectado: s.textoDetectado ?? null,
          opciones: s.opciones ? (s.opciones as unknown as Prisma.InputJsonValue) : undefined,
          estado: s.estado,
          lat: s.lat,
          lng: s.lng,
          creadaEn: new Date(s.creadaEn),
        },
      });
    },
    async obtenerSolicitud(id) {
      const r = await db().searchRequest.findUnique({ where: { id }, include: { consultas: true } });
      return r ? aSolicitud(r) : undefined;
    },
    async actualizarSolicitud(id, p) {
      await db().searchRequest.update({
        where: { id },
        data: {
          segmentoId: p.segmentoId,
          textoDetectado: p.textoDetectado,
          opciones: p.opciones ? (p.opciones as unknown as Prisma.InputJsonValue) : undefined,
          lat: p.lat,
          lng: p.lng,
        },
      });
    },
    async transicionar(id, de, a) {
      const r = await db().searchRequest.updateMany({
        where: { id, estado: de },
        data: { estado: a, ...(a === 'resuelta' || a === 'sin_resultados' ? { cerradaEn: new Date() } : {}) },
      });
      return r.count === 1;
    },
    async ultimaDePaciente(tel) {
      const r = await db().searchRequest.findFirst({
        where: { telefonoPaciente: tel },
        orderBy: { creadaEn: 'desc' },
        include: { consultas: true },
      });
      return r ? aSolicitud(r) : undefined;
    },

    async crearConsulta(solicitudId, c) {
      await db().pharmacyQuery.upsert({
        where: { solicitudId_farmaciaId: { solicitudId, farmaciaId: c.farmaciaId } },
        update: {},
        create: {
          solicitudId,
          farmaciaId: c.farmaciaId,
          respuesta: c.respuesta,
          distanciaTexto: c.distanciaTexto ?? null,
          distanciaMetros: c.distanciaMetros ?? null,
          abierta: c.abierta,
          enviadaEn: new Date(c.enviadaEn),
        },
      });
    },
    async actualizarConsulta(solicitudId, farmaciaId, p) {
      await db().pharmacyQuery.update({
        where: { solicitudId_farmaciaId: { solicitudId, farmaciaId } },
        data: {
          respuesta: p.respuesta,
          precio: p.precio,
          abierta: p.abierta,
          respondidaEn: p.respondidaEn ? new Date(p.respondidaEn) : undefined,
        },
      });
    },
    async ultimaConsultaDeFarmacia(farmaciaId) {
      const q = await db().pharmacyQuery.findFirst({ where: { farmaciaId }, orderBy: { enviadaEn: 'desc' } });
      if (!q) return undefined;
      const r = await db().searchRequest.findUnique({ where: { id: q.solicitudId }, include: { consultas: true } });
      return r ? aSolicitud(r) : undefined;
    },
    async solicitudAbiertaDeFarmacia(farmaciaId) {
      const q = await db().pharmacyQuery.findFirst({
        where: { farmaciaId, abierta: true, solicitud: { estado: 'consultando' } },
        orderBy: { enviadaEn: 'desc' },
      });
      if (!q) return undefined;
      const r = await db().searchRequest.findUnique({ where: { id: q.solicitudId }, include: { consultas: true } });
      return r ? aSolicitud(r) : undefined;
    },

    async registrarSaliente(a, tipo, cuerpo, dryRun) {
      await db().outboundMessage.create({
        data: { a, tipo, cuerpo: cuerpo as Prisma.InputJsonValue, dryRun },
      });
    },
    async salientesDe(telefono, despues = 0) {
      const filas = await db().outboundMessage.findMany({
        where: { a: telefono, id: { gt: despues } },
        orderBy: { id: 'asc' },
      });
      return filas.map((m) => ({ id: m.id, a: m.a, tipo: m.tipo, cuerpo: m.cuerpo, creadoEn: m.creadoEn.getTime() }));
    },

    async demandaDeFarmacia(farmaciaId, desde) {
      const filas = await db().pharmacyQuery.findMany({
        where: { farmaciaId, enviadaEn: { gte: new Date(desde) }, solicitud: { segmentoId: { not: null } } },
        select: { respuesta: true, solicitud: { select: { segmentoId: true } } },
      });
      const acc = new Map<string, FilaDemanda>();
      for (const f of filas) {
        const id = f.solicitud.segmentoId;
        if (!id) continue;
        const x = acc.get(id) ?? { segmentoId: id, busquedas: 0, noTenia: 0, sinRespuesta: 0, siTenia: 0 };
        x.busquedas++;
        if (f.respuesta === 'no_tengo') x.noTenia++;
        else if (f.respuesta === 'si_tengo') x.siTenia++;
        else x.sinRespuesta++;
        acc.set(id, x);
      }
      return [...acc.values()];
    },
  };
}
