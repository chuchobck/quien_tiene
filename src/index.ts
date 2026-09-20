import Fastify from 'fastify';
import { config } from './config.ts';
import { registrarWebhook } from './whatsapp/webhook.ts';
import { farmaciasActivas } from './core/catalogo.ts';

const app = Fastify({
  logger: { transport: undefined, level: 'info' },
});

app.get('/', async () => ({
  servicio: 'quien-tiene',
  estado: 'ok',
  farmaciasActivas: farmaciasActivas().length,
}));

app.get('/salud', async () => ({ ok: true }));

registrarWebhook(app);

try {
  await app.listen({ port: config.servidor.puerto, host: config.servidor.host });
  app.log.info(`Farmacias activas cargadas: ${farmaciasActivas().length}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
