import type { FastifyInstance } from 'fastify';
import { config } from '../config.ts';
import { encolarMensaje } from '../cola/index.ts';
import { store } from '../store/index.ts';
import { mascararTelefono } from '../util/log.ts';
import type { MensajeEntrante } from './tipos.ts';

interface CuerpoWebhook {
  entry?: { changes?: { value?: { messages?: MensajeEntrante[] } }[] }[];
}

/** Validacion minima de forma: un mensaje sin id o sin remitente no se puede deduplicar ni contestar. */
export function extraerMensajes(cuerpo: unknown): MensajeEntrante[] {
  const c = cuerpo as CuerpoWebhook | null;
  const todos = c?.entry?.flatMap((e) => e.changes?.flatMap((ch) => ch.value?.messages ?? []) ?? []) ?? [];
  return todos.filter(
    (m) => typeof m?.id === 'string' && m.id !== '' && typeof m.from === 'string' && typeof m.type === 'string'
  );
}

export function registrarWebhook(app: FastifyInstance): void {
  // Verificacion inicial que hace Meta al configurar el webhook.
  app.get('/webhook', async (req, reply) => {
    const q = req.query as Record<string, string>;
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === config.whatsapp.verifyToken) {
      app.log.info('Webhook verificado por Meta');
      return reply.code(200).send(q['hub.challenge']);
    }
    return reply.code(403).send('Token invalido');
  });

  app.post('/webhook', async (req, reply) => {
    // Responder 200 de inmediato o Meta reintenta y duplica. Aqui solo se
    // valida, deduplica y encola; el trabajo real lo hace el worker.
    reply.code(200).send('EVENT_RECEIVED');

    try {
      for (const m of extraerMensajes(req.body)) {
        // Dedupe por message.id con unique en la base.
        if (!(await store().registrarEntrante(m.id, m.type))) continue;
        try {
          await encolarMensaje(m);
        } catch (err) {
          // Si no se pudo encolar, se olvida el id para que el reintento de Meta si entre.
          await store().olvidarEntrante(m.id);
          throw err;
        }
        app.log.info({ de: mascararTelefono(m.from), tipo: m.type }, 'Mensaje encolado');
      }
    } catch (err) {
      app.log.error({ err }, 'Error encolando webhook');
    }
  });
}
