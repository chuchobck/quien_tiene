import { config } from '../config.ts';
import { store } from '../store/index.ts';
import { log } from '../util/log.ts';

const BASE = () =>
  `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}`;

async function enviar(cuerpo: Record<string, unknown> & { to: string; type: string }): Promise<void> {
  if (config.whatsappDryRun.activo) {
    // Dry-run: no se llama a Meta. Queda en consola (telefono enmascarado) y en la tabla.
    log.info(`[dry-run] saliente ${cuerpo.type} -> ${cuerpo.to}`);
    await store().registrarSaliente(cuerpo.to, cuerpo.type, cuerpo, true);
    return;
  }

  const res = await fetch(`${BASE()}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...cuerpo }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const detalle = await res.text();
    throw new Error(`WhatsApp API ${res.status}: ${detalle.slice(0, 300)}`);
  }
  await store().registrarSaliente(cuerpo.to, cuerpo.type, cuerpo, false);
}

/** Texto libre. Solo funciona dentro de la ventana de servicio de 24 h. */
export async function enviarTexto(a: string, texto: string): Promise<void> {
  await enviar({
    to: a,
    type: 'text',
    text: { preview_url: false, body: texto },
  });
}

/** Texto con botones de respuesta rapida. Tambien requiere ventana abierta. */
export async function enviarBotones(
  a: string,
  texto: string,
  botones: { id: string; titulo: string }[]
): Promise<void> {
  await enviar({
    to: a,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: texto },
      action: {
        buttons: botones.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.titulo.slice(0, 20) },
        })),
      },
    },
  });
}

/**
 * Consulta a la farmacia.
 * Con USAR_PLANTILLA=true usa la plantilla aprobada por Meta (puede iniciar
 * conversacion en frio). Con false usa botones, que exige que la farmacia
 * haya escrito primero: el plan B mientras Meta aprueba.
 */
export async function consultarFarmacia(
  telefonoFarmacia: string,
  medicamento: string,
  distancia: string,
  solicitudId: string
): Promise<void> {
  if (config.whatsapp.usarPlantilla) {
    await enviar({
      to: telefonoFarmacia,
      type: 'template',
      template: {
        name: config.whatsapp.nombrePlantilla,
        language: { code: config.whatsapp.idiomaPlantilla },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: medicamento },
              { type: 'text', text: distancia },
            ],
          },
        ],
      },
    });
    return;
  }

  await enviarBotones(
    telefonoFarmacia,
    `¿Tienes ${medicamento} disponible? Cliente ubicado a ${distancia} de tu farmacia.`,
    [
      { id: `si:${solicitudId}`, titulo: 'Sí tengo' },
      { id: `no:${solicitudId}`, titulo: 'No tengo' },
    ]
  );
}

/**
 * Descarga un archivo multimedia de WhatsApp.
 * En dry-run, un media id "mock:<fixture>" devuelve bytes falsos que el
 * proveedor mock entiende, sin tocar la red.
 */
export async function descargarMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (config.whatsappDryRun.activo && mediaId.startsWith('mock:')) {
    return { buffer: Buffer.from(`MOCK:${mediaId.slice(5)}`), mimeType: 'image/x-mock' };
  }
  const metaRes = await fetch(
    `https://graph.facebook.com/${config.whatsapp.apiVersion}/${mediaId}`,
    { headers: { Authorization: `Bearer ${config.whatsapp.token}` }, signal: AbortSignal.timeout(15_000) }
  );
  if (!metaRes.ok) throw new Error(`No se pudo leer el media (${metaRes.status})`);

  const meta = (await metaRes.json()) as { url: string; mime_type: string };

  const archivoRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${config.whatsapp.token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!archivoRes.ok) throw new Error(`No se pudo descargar el media (${archivoRes.status})`);

  return { buffer: Buffer.from(await archivoRes.arrayBuffer()), mimeType: meta.mime_type };
}
