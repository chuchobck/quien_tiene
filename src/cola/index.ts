import { Queue, Worker, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config.ts';
import { configurarPlanificador } from '../core/planificador.ts';
import {
  avisarFalla,
  avisarFallaCierre,
  cerrarSolicitud,
  manejarMensaje,
} from '../core/orquestador.ts';
import { log } from '../util/log.ts';
import type { MensajeEntrante } from '../whatsapp/tipos.ts';

const INTENTOS = 3;

const opcionesBase: JobsOptions = {
  attempts: INTENTOS,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 1000 },
  // Dead-letter razonable: los jobs que agotan reintentos se quedan en el
  // conjunto "failed" de BullMQ (inspeccionable) en vez de borrarse.
  removeOnFail: { count: 5000 },
};

let conexion: Redis | undefined;
let colaMensajes: Queue<MensajeEntrante> | undefined;
let colaCierres: Queue<{ solicitudId: string }> | undefined;

function redis(): Redis {
  // maxRetriesPerRequest:null lo exige BullMQ para los workers.
  conexion ??= new Redis(config.db.redisUrl, { maxRetriesPerRequest: null });
  return conexion;
}

function mensajes() {
  colaMensajes ??= new Queue<MensajeEntrante>('mensajes', { connection: redis() });
  return colaMensajes;
}
function cierres() {
  colaCierres ??= new Queue<{ solicitudId: string }>('cierres', { connection: redis() });
  return colaCierres;
}

/** El webhook solo llama a esto. jobId = id de WhatsApp: segunda barrera de idempotencia. */
export async function encolarMensaje(m: MensajeEntrante): Promise<void> {
  await mensajes().add('mensaje', m, { ...opcionesBase, jobId: m.id });
}

export async function programarCierreEnCola(solicitudId: string, esperaMs: number): Promise<void> {
  await cierres().add('cerrar', { solicitudId }, { ...opcionesBase, delay: esperaMs, jobId: `cierre-${solicitudId}` });
}

/** Conecta el planificador del orquestador con BullMQ. Lo llaman el servidor y el worker. */
export function iniciarPlanificador(): void {
  configurarPlanificador(programarCierreEnCola);
}

/** Arranca los workers (mensajes + cierres). Devuelve una funcion para detenerlos. */
export function iniciarWorkers(): () => Promise<void> {
  iniciarPlanificador();

  const wMensajes = new Worker<MensajeEntrante>('mensajes', (job) => manejarMensaje(job.data), {
    connection: redis(),
    concurrency: 5,
  });
  const wCierres = new Worker<{ solicitudId: string }>('cierres', (job) => cerrarSolicitud(job.data.solicitudId), {
    connection: redis(),
    concurrency: 5,
  });

  wMensajes.on('failed', (job, err) => {
    if (!job) return;
    const definitivo = job.attemptsMade >= (job.opts.attempts ?? INTENTOS);
    log.error(`[cola] mensaje ${job.id} fallo (intento ${job.attemptsMade}/${INTENTOS})`, err);
    if (definitivo) void avisarFalla(job.data);
  });
  wCierres.on('failed', (job, err) => {
    if (!job) return;
    const definitivo = job.attemptsMade >= (job.opts.attempts ?? INTENTOS);
    log.error(`[cola] cierre ${job.id} fallo (intento ${job.attemptsMade}/${INTENTOS})`, err);
    if (definitivo) void avisarFallaCierre(job.data.solicitudId);
  });
  wMensajes.on('error', (err) => log.error('[cola] error del worker de mensajes', err));
  wCierres.on('error', (err) => log.error('[cola] error del worker de cierres', err));

  return async () => {
    await Promise.all([wMensajes.close(), wCierres.close()]);
  };
}

export async function cerrarCola(): Promise<void> {
  await Promise.all([colaMensajes?.close(), colaCierres?.close()]);
  conexion?.disconnect();
  colaMensajes = colaCierres = undefined;
  conexion = undefined;
}
