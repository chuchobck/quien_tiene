import { iniciarWorkers } from './cola/index.ts';
import { config } from './config.ts';
import { log } from './util/log.ts';

// Proceso separado: npm run worker (con el servidor en WORKER_EMBEBIDO=false).
const detener = iniciarWorkers();
log.info(`[worker] arriba · IA: ${config.recetas.proveedor} · dry-run: ${config.whatsappDryRun.activo}`);

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    void detener().then(() => process.exit(0));
  });
}
