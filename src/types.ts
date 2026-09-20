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
}

export type EstadoSolicitud =
  | 'esperando_confirmacion'
  | 'consultando'
  | 'resuelta'
  | 'sin_resultados';

export interface Solicitud {
  id: string;
  telefonoPaciente: string;
  segmentoId?: string;
  textoDetectado?: string;
  estado: EstadoSolicitud;
  creadaEn: number;
  /** Ubicacion del paciente. Si no la comparte, se usa el centro de Sangolqui. */
  lat: number;
  lng: number;
  consultas: ConsultaFarmacia[];
}

/** Lo que Gemini devuelve al leer una receta o un texto. */
export interface LecturaMedicamento {
  encontrado: boolean;
  principioActivo?: string;
  concentracion?: string;
  forma?: string;
  nombreComercial?: string;
  textoCrudo?: string;
  confianza: 'alta' | 'media' | 'baja';
}
