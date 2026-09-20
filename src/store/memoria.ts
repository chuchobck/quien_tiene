import type { Solicitud } from '../types.ts';

/**
 * Almacen en memoria. Deliberado para el demo del DevFest.
 *
 * Toda la app habla con este modulo y nunca con la estructura de datos
 * directamente. En la Fase 8 se cambia por Postgres + PostGIS tocando
 * unicamente este archivo.
 */

const solicitudes = new Map<string, Solicitud>();
/** telefono de farmacia -> id de la solicitud que esta contestando */
const consultaAbierta = new Map<string, string>();

export const store = {
  guardar(s: Solicitud): void {
    solicitudes.set(s.id, s);
  },

  obtener(id: string): Solicitud | undefined {
    return solicitudes.get(id);
  },

  /** Ultima solicitud viva de un paciente. */
  ultimaDePaciente(telefono: string): Solicitud | undefined {
    const propias = [...solicitudes.values()]
      .filter((s) => s.telefonoPaciente === telefono)
      .sort((a, b) => b.creadaEn - a.creadaEn);
    return propias[0];
  },

  marcarConsultaAbierta(telefonoFarmacia: string, solicitudId: string): void {
    consultaAbierta.set(telefonoFarmacia, solicitudId);
  },

  solicitudDeFarmacia(telefonoFarmacia: string): Solicitud | undefined {
    const id = consultaAbierta.get(telefonoFarmacia);
    return id ? solicitudes.get(id) : undefined;
  },

  cerrarConsulta(telefonoFarmacia: string): void {
    consultaAbierta.delete(telefonoFarmacia);
  },

  todas(): Solicitud[] {
    return [...solicitudes.values()];
  },
};
