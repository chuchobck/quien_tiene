import type { FastifyInstance } from 'fastify';
import { config } from '../config.ts';
import { farmaciaPorTelefono } from '../core/catalogo.ts';
import {
  farmaciaEnvioPrecio,
  farmaciaRespondio,
  pacienteCompartioUbicacion,
  pacienteConfirmo,
  pacienteCorrigio,
  pacienteEnvioFoto,
  pacienteEnvioTexto,
} from '../core/orquestador.ts';

/** Evita procesar dos veces el mismo mensaje: Meta reintenta los webhooks. */
const vistos = new Set<string>();

interface MensajeEntrante {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  image?: { id: string };
  location?: { latitude: number; longitude: number };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  /**
   * Boton de RESPUESTA RAPIDA que viene pegado a una PLANTILLA aprobada.
   * Distinto de "interactive": ese es para los botones que este mismo
   * servidor arma con enviarBotones(). Este es el que manda Meta cuando
   * la farmacia toca "Si tengo" / "No tengo" en el mensaje de plantilla.
   */
  button?: { text?: string; payload?: string };
}

/** true = "si tengo", false = "no tengo", null = no reconocido. */
function interpretarRespuesta(texto: string): boolean | null {
  const t = texto.trim().toLowerCase();
  if (/^(1|si|sí|si tengo|sí tengo)$/.test(t)) return true;
  if (/^(2|no|no tengo)$/.test(t)) return false;
  return null;
}

export function registrarWebhook(app: FastifyInstance): void {
  // Verificacion inicial que hace Meta al configurar el webhook.
  app.get('/webhook', async (req, reply) => {
    const q = req.query as Record<string, string>;
    if (
      q['hub.mode'] === 'subscribe' &&
      q['hub.verify_token'] === config.whatsapp.verifyToken
    ) {
      app.log.info('Webhook verificado por Meta');
      return reply.code(200).send(q['hub.challenge']);
    }
    return reply.code(403).send('Token invalido');
  });

  app.post('/webhook', async (req, reply) => {
    // Responder 200 de inmediato o Meta reintenta y duplica.
    reply.code(200).send('EVENT_RECEIVED');

    try {
      const cuerpo = req.body as {
        entry?: {
          changes?: { value?: { messages?: MensajeEntrante[] } }[];
        }[];
      };

      const mensajes =
        cuerpo.entry?.flatMap(
          (e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []
        ) ?? [];

      for (const m of mensajes) {
        if (vistos.has(m.id)) continue;
        vistos.add(m.id);
        if (vistos.size > 1000) vistos.clear();

        await manejar(m, app);
      }
    } catch (err) {
      app.log.error({ err }, 'Error procesando webhook');
    }
  });
}

async function manejar(m: MensajeEntrante, app: FastifyInstance): Promise<void> {
  const esFarmacia = Boolean(farmaciaPorTelefono(m.from));
  app.log.info({ de: m.from, tipo: m.type, esFarmacia }, 'Mensaje entrante');

  // ── Boton de plantilla (quick reply pegado a un mensaje de plantilla) ──
  if (m.type === 'button' && m.button) {
    if (!esFarmacia) return;
    const texto = m.button.payload ?? m.button.text ?? '';
    const tiene = interpretarRespuesta(texto);
    if (tiene === null) return;
    return void (await farmaciaRespondio(m.from, tiene));
  }

  // ── Botones propios (los que este servidor arma con enviarBotones) ──
  if (m.type === 'interactive' && m.interactive?.button_reply) {
    const id = m.interactive.button_reply.id;
    const [accion, ref] = id.split(':');

    if (accion === 'confirmar' && ref) return void (await pacienteConfirmo(ref));
    if (accion === 'corregir' && ref) return void (await pacienteCorrigio(ref));
    if (accion === 'si') return void (await farmaciaRespondio(m.from, true));
    if (accion === 'no') return void (await farmaciaRespondio(m.from, false));
    return;
  }

  // ── Ubicacion ──
  if (m.type === 'location' && m.location) {
    return void (await pacienteCompartioUbicacion(
      m.from,
      m.location.latitude,
      m.location.longitude
    ));
  }

  // ── Imagen: solo tiene sentido del lado paciente ──
  if (m.type === 'image' && m.image) {
    if (esFarmacia) return;
    return void (await pacienteEnvioFoto(m.from, m.image.id));
  }

  // ── Texto ──
  if (m.type === 'text' && m.text) {
    const texto = m.text.body.trim();

    if (esFarmacia) {
      // Primero se intenta leer como precio de una consulta abierta.
      const fuePrecio = await farmaciaEnvioPrecio(m.from, texto);
      if (fuePrecio) return;

      // Respuestas escritas a mano, por si no usa los botones.
      const tiene = interpretarRespuesta(texto);
      if (tiene !== null) return void (await farmaciaRespondio(m.from, tiene));
      return;
    }

    return void (await pacienteEnvioTexto(m.from, texto));
  }
}
