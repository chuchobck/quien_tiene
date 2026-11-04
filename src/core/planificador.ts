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

export function programarCierre(solicitudId: string, esperaMs: number): Promise<void> {
  return impl(solicitudId, esperaMs);
}
