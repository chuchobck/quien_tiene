import type {
  ConsultaFarmacia,
  EstadoSolicitud,
  Farmacia,
  SegmentoMercado,
  Solicitud,
} from '../types.ts';

export interface FilaDemanda {
  segmentoId: string;
  /** Conteos agregados. Jamas llevan datos del paciente. */
  busquedas: number;
  noTenia: number;
  sinRespuesta: number;
  siTenia: number;
}

export interface MensajeSaliente {
  id: number;
  a: string;
  tipo: string;
  cuerpo: unknown;
  creadoEn: number;
}

/** Unica puerta a la persistencia. Hay dos implementaciones: Prisma y memoria (pruebas). */
export interface Store {
  segmentos(): Promise<SegmentoMercado[]>;
  farmacias(): Promise<Farmacia[]>;
  farmaciaPorTelefono(telefono: string): Promise<Farmacia | undefined>;
  farmaciaPorId(id: string): Promise<Farmacia | undefined>;

  /** Idempotencia. true si el id es nuevo; false si ya se habia visto. */
  registrarEntrante(id: string, tipo: string): Promise<boolean>;
  olvidarEntrante(id: string): Promise<void>;

  crearSolicitud(s: Omit<Solicitud, 'consultas'>): Promise<void>;
  obtenerSolicitud(id: string): Promise<Solicitud | undefined>;
  actualizarSolicitud(
    id: string,
    parche: Partial<Pick<Solicitud, 'segmentoId' | 'textoDetectado' | 'opciones' | 'lat' | 'lng'>>
  ): Promise<void>;
  /** Cambio atomico de estado. false si la solicitud ya no estaba en `de`. */
  transicionar(id: string, de: EstadoSolicitud, a: EstadoSolicitud): Promise<boolean>;
  ultimaDePaciente(telefono: string): Promise<Solicitud | undefined>;

  crearConsulta(solicitudId: string, c: ConsultaFarmacia): Promise<void>;
  actualizarConsulta(
    solicitudId: string,
    farmaciaId: string,
    parche: Partial<Pick<ConsultaFarmacia, 'respuesta' | 'precio' | 'respondidaEn' | 'abierta'>>
  ): Promise<void>;
  /** La solicitud MAS RECIENTE que tiene una consulta para esta farmacia, en cualquier estado. */
  ultimaConsultaDeFarmacia(farmaciaId: string): Promise<Solicitud | undefined>;
  /** Solicitud en curso (estado consultando) con una consulta abierta para esta farmacia. */
  solicitudAbiertaDeFarmacia(farmaciaId: string): Promise<Solicitud | undefined>;

  registrarSaliente(a: string, tipo: string, cuerpo: unknown, dryRun: boolean): Promise<void>;
  salientesDe(telefono: string, despuesDeId?: number): Promise<MensajeSaliente[]>;

  /** Conteos agregados por segmento desde `desde` (ms epoch). */
  demandaDeFarmacia(farmaciaId: string, desde: number): Promise<FilaDemanda[]>;
}
