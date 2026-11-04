import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConsultaFarmacia, Farmacia, SegmentoMercado, Solicitud } from '../types.ts';
import type { FilaDemanda, MensajeSaliente, Store } from './tipos.ts';

/**
 * Implementacion en memoria del Store. Se usa en las pruebas unitarias
 * (sin base de datos) y cumple el mismo contrato que la de Prisma.
 */
export function crearStoreMemoria(): Store {
  const datos = <T>(archivo: string): T =>
    JSON.parse(readFileSync(join(process.cwd(), 'data', archivo), 'utf8')) as T;
  const segmentos = datos<SegmentoMercado[]>('medicamentos.json');
  const farmacias = datos<Farmacia[]>('farmacias.json');
  const solicitudes = new Map<string, Solicitud>();
  const entrantes = new Set<string>();
  const salientes: MensajeSaliente[] = [];
  const clonar = <T>(x: T): T => structuredClone(x);
  const digitos = (t: string) => t.replace(/\D/g, '');

  return {
    async segmentos() { return clonar(segmentos); },
    async farmacias() { return clonar(farmacias); },
    async farmaciaPorTelefono(t) {
      return clonar(farmacias.find((f) => digitos(f.telefono) === digitos(t)));
    },
    async farmaciaPorId(id) { return clonar(farmacias.find((f) => f.id === id)); },

    async registrarEntrante(id) {
      if (entrantes.has(id)) return false;
      entrantes.add(id);
      return true;
    },
    async olvidarEntrante(id) { entrantes.delete(id); },

    async crearSolicitud(s) { solicitudes.set(s.id, { ...clonar(s), consultas: [] }); },
    async obtenerSolicitud(id) { return clonar(solicitudes.get(id)); },
    async actualizarSolicitud(id, parche) {
      const s = solicitudes.get(id);
      if (s) Object.assign(s, clonar(parche));
    },
    async transicionar(id, de, a) {
      const s = solicitudes.get(id);
      if (!s || s.estado !== de) return false;
      s.estado = a;
      return true;
    },
    async ultimaDePaciente(tel) {
      const propias = [...solicitudes.values()]
        .filter((s) => s.telefonoPaciente === tel)
        .sort((a, b) => b.creadaEn - a.creadaEn);
      return clonar(propias[0]);
    },

    async crearConsulta(solicitudId, c: ConsultaFarmacia) {
      const s = solicitudes.get(solicitudId);
      if (s && !s.consultas.some((x) => x.farmaciaId === c.farmaciaId)) s.consultas.push(clonar(c));
    },
    async actualizarConsulta(solicitudId, farmaciaId, parche) {
      const c = solicitudes.get(solicitudId)?.consultas.find((x) => x.farmaciaId === farmaciaId);
      if (c) Object.assign(c, parche);
    },
    async ultimaConsultaDeFarmacia(farmaciaId) {
      const cand = [...solicitudes.values()]
        .filter((s) => s.consultas.some((c) => c.farmaciaId === farmaciaId))
        .sort((a, b) => b.creadaEn - a.creadaEn);
      return clonar(cand[0]);
    },
    async solicitudAbiertaDeFarmacia(farmaciaId) {
      const candidatas = [...solicitudes.values()]
        .filter((s) => s.estado === 'consultando' &&
          s.consultas.some((c) => c.farmaciaId === farmaciaId && c.abierta))
        .sort((a, b) => b.creadaEn - a.creadaEn);
      return clonar(candidatas[0]);
    },

    async registrarSaliente(a, tipo, cuerpo) {
      salientes.push({ id: salientes.length + 1, a, tipo, cuerpo: clonar(cuerpo), creadoEn: Date.now() });
    },
    async salientesDe(tel, despues = 0) {
      return clonar(salientes.filter((m) => m.a === tel && m.id > despues));
    },

    async demandaDeFarmacia(farmaciaId, desde) {
      const filas = new Map<string, FilaDemanda>();
      for (const s of solicitudes.values()) {
        if (!s.segmentoId || s.creadaEn < desde) continue;
        const c = s.consultas.find((x) => x.farmaciaId === farmaciaId);
        if (!c) continue;
        const f = filas.get(s.segmentoId) ??
          { segmentoId: s.segmentoId, busquedas: 0, noTenia: 0, sinRespuesta: 0, siTenia: 0 };
        f.busquedas++;
        if (c.respuesta === 'no_tengo') f.noTenia++;
        else if (c.respuesta === 'si_tengo') f.siTenia++;
        else f.sinRespuesta++;
        filas.set(s.segmentoId, f);
      }
      return [...filas.values()];
    },
  };
}
