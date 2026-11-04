import { crearApp } from './app.ts';
import { iniciarPlanificador, iniciarWorkers } from './cola/index.ts';
import { config } from './config.ts';

const app = crearApp();
let detenerWorkers: (() => Promise<void>) | undefined;

// El servidor siempre puede programar cierres; el worker corre aqui solo si WORKER_EMBEBIDO=true.
if (config.cola.workerEmbebido) detenerWorkers = iniciarWorkers();
else iniciarPlanificador();

try {
  await app.listen({ port: config.servidor.puerto, host: config.servidor.host });
  app.log.info(`Worker embebido: ${config.cola.workerEmbebido} · IA: ${config.recetas.proveedor} · dry-run: ${config.whatsappDryRun.activo}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    void (async () => {
      await app.close();
      await detenerWorkers?.();
      process.exit(0);
    })();
  });
}
