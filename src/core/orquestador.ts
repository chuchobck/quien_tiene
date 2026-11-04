import { randomUUID } from 'node:crypto';
import { ErrorLecturaReceta, lectorDeRecetas, type RecipeExtraction } from '../ai/index.ts';
import { config } from '../config.ts';
import { distanciaCaminando } from '../maps/client.ts';
import { store } from '../store/index.ts';
import type { OpcionMedicamento, SegmentoMercado } from '../types.ts';
import { log } from '../util/log.ts';
import { consultarFarmacia, descargarMedia, enviarBotones, enviarTexto } from '../whatsapp/client.ts';
import type { MensajeEntrante } from '../whatsapp/tipos.ts';
import { etiqueta, nombreParaPaciente, resolverSegmentos } from './catalogo.ts';
import { programarCierre } from './planificador.ts';

/** Centro de Sangolqui. Se usa si el paciente no comparte ubicacion. */
const UBICACION_POR_DEFECTO = { lat: -0.33, lng: -78.445 };

/** WhatsApp admite maximo 3 botones de respuesta rapida. */
const MAX_OPCIONES = 3;

// ─────────── Enrutador de mensajes entrantes (lo ejecuta el worker) ───────────

/** true = "si tengo", false = "no tengo", null = no reconocido. */
export function interpretarRespuesta(texto: string): boolean | null {
  const t = texto.trim().toLowerCase();
  if (/^(1|si|sí|si tengo|sí tengo)$/.test(t)) return true;
  if (/^(2|no|no tengo)$/.test(t)) return false;
  return null;
}

export async function manejarMensaje(m: MensajeEntrante): Promise<void> {
  const farmacia = await store().farmaciaPorTelefono(m.from);
  const esFarmacia = Boolean(farmacia);
  log.info(`[orquestador] mensaje ${m.type} de ${m.from} (farmacia=${esFarmacia})`);

  // Boton de plantilla (quick reply pegado a un mensaje de plantilla).
  if (m.type === 'button' && m.button) {
    if (!esFarmacia) return;
    const tiene = interpretarRespuesta(m.button.payload ?? m.button.text ?? '');
    if (tiene === null) return;
    return farmaciaRespondio(m.from, tiene);
  }

  // Botones propios (los que este servidor arma con enviarBotones).
  if (m.type === 'interactive' && m.interactive?.button_reply) {
    const [accion, ref, extra] = m.interactive.button_reply.id.split(':');
    if (accion === 'elegir' && ref && extra !== undefined) return pacienteEligio(ref, Number(extra));
    if (accion === 'confirmar' && ref) return pacienteConfirmo(ref);
    if (accion === 'corregir' && ref) return pacienteCorrigio(ref);
    if (accion === 'si') return farmaciaRespondio(m.from, true);
    if (accion === 'no') return farmaciaRespondio(m.from, false);
    return;
  }

  if (m.type === 'location' && m.location) {
    return pacienteCompartioUbicacion(m.from, m.location.latitude, m.location.longitude);
  }

  if (m.type === 'image' && m.image) {
    if (esFarmacia) return;
    return pacienteEnvioFoto(m.from, m.image.id);
  }

  if (m.type === 'text' && m.text) {
    const texto = m.text.body.trim();
    if (esFarmacia) {
      if (await farmaciaEnvioPrecio(m.from, texto)) return;
      const tiene = interpretarRespuesta(texto);
      if (tiene !== null) return farmaciaRespondio(m.from, tiene);
      return;
    }
    return pacienteEnvioTexto(m.from, texto);
  }
}

/**
 * Ultimo recurso del worker: se agotaron los reintentos. El paciente nunca se
 * queda sin respuesta, aunque sea para decirle que reintente.
 */
export async function avisarFalla(m: MensajeEntrante): Promise<void> {
  if (await store().farmaciaPorTelefono(m.from)) return;
  await enviarTexto(
    m.from,
    'Tuvimos un problema procesando tu mensaje. Por favor intenta de nuevo en un momento, ' +
      'o escribe el nombre del medicamento tal como aparece en la caja.'
  ).catch((err) => log.error('[orquestador] no se pudo avisar la falla', err));
}

export async function avisarFallaCierre(solicitudId: string): Promise<void> {
  const s = await store().obtenerSolicitud(solicitudId);
  if (!s) return;
  await enviarTexto(
    s.telefonoPaciente,
    'Tuvimos un problema al armar tu resultado. Intenta tu búsqueda de nuevo en un momento.'
  ).catch((err) => log.error('[orquestador] no se pudo avisar la falla de cierre', err));
}

// ─────────── Entrada del paciente ───────────

export async function pacienteEnvioFoto(telefono: string, mediaId: string): Promise<void> {
  await enviarTexto(telefono, 'Estoy leyendo tu receta, dame un segundo.');
  const { buffer, mimeType } = await descargarMedia(mediaId);
  await procesarExtraccion(telefono, await leer(() => lectorDeRecetas().readImage(buffer, mimeType)));
}

export async function pacienteEnvioTexto(telefono: string, texto: string): Promise<void> {
  await procesarExtraccion(telefono, await leer(() => lectorDeRecetas().readText(texto)));
}

/** Un error CONTROLADO del lector (JSON invalido tras reintento) se vuelve "no legible"; el resto reintenta. */
async function leer(fn: () => Promise<RecipeExtraction>): Promise<RecipeExtraction | null> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ErrorLecturaReceta) {
      log.error('[orquestador] lectura de receta fallo de forma controlada', err);
      return null;
    }
    throw err;
  }
}

export async function pacienteCompartioUbicacion(telefono: string, lat: number, lng: number): Promise<void> {
  const s = await store().ultimaDePaciente(telefono);
  if (!s) return;
  await store().actualizarSolicitud(s.id, { lat, lng });
}

const MENSAJE_NO_IDENTIFICADO =
  'No pude identificar el medicamento. Escribe el nombre tal como aparece ' +
  'en la caja o en la receta, por ejemplo: Enalapril 10 mg.';

async function procesarExtraccion(telefono: string, ext: RecipeExtraction | null): Promise<void> {
  if (!ext || !ext.legible || ext.medications.length === 0) {
    await enviarTexto(
      telefono,
      'No alcancé a leer la receta. Prueba con otra foto más de frente y con buena luz, ' +
        'o escribe el nombre del medicamento.'
    );
    return;
  }

  const segmentos = await store().segmentos();
  const opciones: OpcionMedicamento[] = [];
  for (const med of ext.medications) {
    const candidatos = resolverSegmentos(med, segmentos);
    const texto = nombreParaPaciente(med);
    for (const seg of candidatos) {
      // Si es ambiguo, el paciente ve su propio termino por cada opcion posible.
      if (!opciones.some((o) => o.segmentoId === seg.id)) opciones.push({ texto, segmentoId: seg.id });
    }
  }

  if (opciones.length === 0) {
    await enviarTexto(telefono, MENSAJE_NO_IDENTIFICADO);
    return;
  }

  const base = {
    id: randomUUID().slice(0, 8),
    telefonoPaciente: telefono,
    creadaEn: Date.now(),
    lat: UBICACION_POR_DEFECTO.lat,
    lng: UBICACION_POR_DEFECTO.lng,
  };

  if (opciones.length === 1) {
    const [unica] = opciones as [OpcionMedicamento];
    await store().crearSolicitud({
      ...base,
      segmentoId: unica.segmentoId,
      textoDetectado: unica.texto,
      estado: 'esperando_confirmacion',
    });
    await enviarBotones(telefono, `Leí *${unica.texto}*. ¿Es correcto?`, [
      { id: `confirmar:${base.id}`, titulo: 'Sí, buscar' },
      { id: `corregir:${base.id}`, titulo: 'No, corregir' },
    ]);
    return;
  }

  // Varios medicamentos: el paciente elige UNO (maximo 3 botones).
  const mostradas = opciones.slice(0, MAX_OPCIONES);
  await store().crearSolicitud({ ...base, opciones: mostradas, estado: 'esperando_seleccion' });
  const aviso = opciones.length > MAX_OPCIONES
    ? ` Te muestro los primeros ${MAX_OPCIONES}; para otro, escribe su nombre.`
    : '';
  await enviarBotones(
    telefono,
    `Encontré varios medicamentos. ¿Cuál quieres buscar primero?${aviso}`,
    mostradas.map((o, i) => ({ id: `elegir:${base.id}:${i}`, titulo: o.texto }))
  );
}

export async function pacienteEligio(solicitudId: string, indice: number): Promise<void> {
  const s = await store().obtenerSolicitud(solicitudId);
  const opcion = s?.opciones?.[indice];
  if (!s || !opcion) return;
  // Atomico: un doble toque en el boton no abre dos busquedas.
  if (!(await store().transicionar(s.id, 'esperando_seleccion', 'esperando_confirmacion'))) return;
  await store().actualizarSolicitud(s.id, { segmentoId: opcion.segmentoId, textoDetectado: opcion.texto });
  await enviarBotones(s.telefonoPaciente, `Leí *${opcion.texto}*. ¿Es correcto?`, [
    { id: `confirmar:${s.id}`, titulo: 'Sí, buscar' },
    { id: `corregir:${s.id}`, titulo: 'No, corregir' },
  ]);
}

export async function pacienteConfirmo(solicitudId: string): Promise<void> {
  const s = await store().obtenerSolicitud(solicitudId);
  if (!s || !s.segmentoId) return;
  const segmentos = await store().segmentos();
  const seg: SegmentoMercado | undefined = segmentos.find((x) => x.id === s.segmentoId);
  if (!seg) return;

  // Atomico: si Meta o el paciente repiten el toque, solo el primero consulta.
  if (!(await store().transicionar(s.id, 'esperando_confirmacion', 'consultando'))) return;

  await enviarTexto(s.telefonoPaciente, 'Buscando en farmacias cerca de ti. Te aviso apenas responda alguna.');

  const activas = (await store().farmacias()).filter((f) => f.estado !== 'listada');

  // Cada farmacia se procesa aislada: si a una le falla la red, las demas siguen.
  await Promise.all(
    activas.map(async (f) => {
      try {
        const d = await distanciaCaminando({ lat: s.lat, lng: s.lng }, { lat: f.lat, lng: f.lng });
        await store().crearConsulta(s.id, {
          farmaciaId: f.id,
          enviadaEn: Date.now(),
          respuesta: 'sin_respuesta',
          distanciaTexto: d.texto,
          distanciaMetros: d.metros,
          abierta: true,
        });
        await consultarFarmacia(f.telefono, etiqueta(seg), d.texto, s.id);
      } catch (err) {
        log.error(`[orquestador] fallo consultando a ${f.nombre}`, err);
      }
    })
  );

  // Cierre con lo que haya: job con delay (BullMQ), no setTimeout.
  await programarCierre(s.id, config.cola.esperaCierreMs);
  // Si ninguna consulta quedo registrada, no tiene sentido esperar.
  await revisarSiYaEstaLista(s.id);
}

export async function pacienteCorrigio(solicitudId: string): Promise<void> {
  const s = await store().obtenerSolicitud(solicitudId);
  if (!s) return;
  await enviarTexto(s.telefonoPaciente, 'Escribe el nombre del medicamento tal como aparece en la caja.');
}

// ─────────── Respuesta de la farmacia ───────────

export async function farmaciaRespondio(telefonoFarmacia: string, tiene: boolean): Promise<void> {
  const f = await store().farmaciaPorTelefono(telefonoFarmacia);
  if (!f) return;
  const s = await store().solicitudAbiertaDeFarmacia(f.id);
  const consulta = s?.consultas.find((c) => c.farmaciaId === f.id);
  if (!s || !consulta || consulta.respuesta !== 'sin_respuesta') return;

  if (!tiene) {
    await store().actualizarConsulta(s.id, f.id, { respuesta: 'no_tengo', respondidaEn: Date.now(), abierta: false });
    await enviarTexto(telefonoFarmacia, 'Gracias por responder.');
    await revisarSiYaEstaLista(s.id);
    return;
  }

  await store().actualizarConsulta(s.id, f.id, { respuesta: 'si_tengo', respondidaEn: Date.now() });
  await enviarTexto(
    telefonoFarmacia,
    'Gracias. ¿A qué precio lo tienes? Responde solo el número, por ejemplo: 4.80'
  );
}

export async function farmaciaEnvioPrecio(telefonoFarmacia: string, texto: string): Promise<boolean> {
  const f = await store().farmaciaPorTelefono(telefonoFarmacia);
  if (!f) return false;
  const s = await store().solicitudAbiertaDeFarmacia(f.id);
  const consulta = s?.consultas.find((c) => c.farmaciaId === f.id);
  if (!s || !consulta || consulta.respuesta !== 'si_tengo' || consulta.precio !== undefined) return false;

  const match = texto.replace(',', '.').match(/\d+(\.\d{1,2})?/);
  if (!match) return false;

  await store().actualizarConsulta(s.id, f.id, { precio: Number(match[0]), abierta: false });
  await enviarTexto(telefonoFarmacia, 'Listo, ya le avisamos al cliente. Gracias.');
  await revisarSiYaEstaLista(s.id);
  return true;
}

// ─────────── Cierre ───────────

async function revisarSiYaEstaLista(solicitudId: string): Promise<void> {
  const s = await store().obtenerSolicitud(solicitudId);
  if (!s || s.estado !== 'consultando') return;
  if (s.consultas.every((c) => !c.abierta)) await cerrarSolicitud(solicitudId);
}

/** La llama el job con delay, o antes si ya contestaron todas. Idempotente. */
export async function cerrarSolicitud(solicitudId: string): Promise<void> {
  const s = await store().obtenerSolicitud(solicitudId);
  if (!s || s.estado !== 'consultando') return;

  const confirmadas = s.consultas
    .filter((c) => c.respuesta === 'si_tengo')
    .sort((a, b) => (a.distanciaMetros ?? 0) - (b.distanciaMetros ?? 0));

  // Solo el primero que logre la transicion envia el mensaje final.
  const destino = confirmadas.length === 0 ? 'sin_resultados' : 'resuelta';
  if (!(await store().transicionar(s.id, 'consultando', destino))) return;

  // Lo que quedaba abierto ya no recibe respuestas.
  for (const c of s.consultas.filter((x) => x.abierta)) {
    await store().actualizarConsulta(s.id, c.farmaciaId, { abierta: false });
  }

  if (confirmadas.length === 0) {
    await enviarTexto(
      s.telefonoPaciente,
      'Ninguna farmacia cercana confirmó tenerlo ahorita. Esa también es información útil: ' +
        'puedes volver a intentar más tarde.'
    );
    return;
  }

  const farmacias = await store().farmacias();
  const segundos = Math.max(0, Math.round((Date.now() - s.creadaEn) / 1000));
  const lineas = confirmadas.map((c) => {
    const f = farmacias.find((x) => x.id === c.farmaciaId);
    const precio = c.precio !== undefined ? ` · $${c.precio.toFixed(2)}` : '';
    return `🟢 *${f?.nombre ?? 'Farmacia'}* · ${c.distanciaTexto}${precio}`;
  });

  await enviarTexto(
    s.telefonoPaciente,
    `${confirmadas.length} farmacia(s) tienen *${s.textoDetectado}*:\n\n` +
      `${lineas.join('\n')}\n\n` +
      `Encontrado en ${segundos} segundos.\n` +
      `Recuerda llevar tu receta.`
  );
}
