/** Clase de equivalencia: principio activo + concentracion + forma. */
export interface SegmentoMercado {
  id: string;
  principioActivo: string;
  concentracion: string;
  forma: string;
  /** Nombres comerciales que caen en este segmento. */
  nombresComerciales: string[];
  /** Como la gente lo llama en la calle. */
  coloquiales: string[];
}

export interface Farmacia {
  id: string;
  nombre: string;
  telefono: string;
  direccion: string;
  lat: number;
  lng: number;
  /** listada = no inscrita | activa = responde a mano | integrada = stock automatico */
  estado: 'listada' | 'activa' | 'integrada';
}

export type RespuestaFarmacia = 'si_tengo' | 'no_tengo' | 'sin_respuesta';

export interface ConsultaFarmacia {
  farmaciaId: string;
  enviadaEn: number;
  respondidaEn?: number;
  respuesta: RespuestaFarmacia;
  precio?: number;
  distanciaTexto?: string;
  distanciaMetros?: number;
  /** true mientras falta algo por contestar (si/no o precio). */
  abierta: boolean;
}

export type EstadoSolicitud =
  | 'esperando_seleccion'
  | 'esperando_confirmacion'
  | 'consultando'
  | 'resuelta'
  | 'sin_resultados';

/** Opcion que el paciente puede elegir cuando la receta trae varios medicamentos. */
export interface OpcionMedicamento {
  /** Termino tal como lo escribio o decia la receta: es lo que ve el paciente. */
  texto: string;
  segmentoId: string;
}

export interface Solicitud {
  id: string;
  telefonoPaciente: string;
  segmentoId?: string;
  /** Termino propio del paciente. Nunca el nombre "resuelto" del catalogo. */
  textoDetectado?: string;
  opciones?: OpcionMedicamento[];
  estado: EstadoSolicitud;
  creadaEn: number;
  /** Ubicacion del paciente. Si no la comparte, se usa el centro de Sangolqui. */
  lat: number;
  lng: number;
  consultas: ConsultaFarmacia[];
}
