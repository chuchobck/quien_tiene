import { config } from '../config.ts';

/**
 * Programa el cierre diferido de una solicitud. La implementacion real es un
 * job con delay en BullMQ (src/cola); las pruebas inyectan un registro.
 */
export type ProgramarCierre = (solicitudId: string, esperaMs: number) => Promise<void>;

let impl: ProgramarCierre = async () => {
  throw new Error('Planificador no configurado: arranca la cola (src/cola) antes de usarlo.');
};

export function configurarPlanificador(fn: ProgramarCierre): void {
  impl = fn;
}

/**
 * Espera del cierre. SOLO el simulador y las pruebas la sobreescriben, en su propio
 * proceso; el producto la toma de config (ESPERA_CIERRE_MS, con minimo de 60 s).
 */
let esperaSimulada: number | undefined;

export function fijarEsperaCierreSimulada(ms: number | undefined): void {
  esperaSimulada = ms;
}

export function esperaCierreMs(): number {
  return esperaSimulada ?? config.cola.esperaCierreMs;
}

export function programarCierre(solicitudId: string, esperaMs: number): Promise<void> {
  return impl(solicitudId, esperaMs);
}
