import Fastify, { type FastifyInstance } from 'fastify';
import { farmaciasActivasCantidad } from './core/resumen.ts';
import { registrarDemanda } from './demanda/rutas.ts';
import { registrarWebhook } from './whatsapp/webhook.ts';

/** Construye la app sin escuchar: asi la reutilizan el servidor, el simulador y las pruebas. */
export function crearApp(logger = true): FastifyInstance {
  const app = Fastify({ logger: logger ? { level: 'info' } : false });

  app.get('/', async () => ({
    servicio: 'quien-tiene',
    estado: 'ok',
    farmaciasActivas: await farmaciasActivasCantidad(),
  }));
  app.get('/salud', async () => ({ ok: true }));

  registrarWebhook(app);
  registrarDemanda(app);
  return app;
}
