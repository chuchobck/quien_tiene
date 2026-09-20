import { randomUUID } from 'node:crypto';
import type { LecturaMedicamento, SegmentoMercado, Solicitud } from '../types.ts';
import { store } from '../store/index.ts';
import {
  etiqueta,
  farmaciaPorTelefono,
  farmaciasActivas,
  resolverSegmento,
  segmentoPorId,
} from './catalogo.ts';
import { leerReceta, leerTexto } from '../gemini/client.ts';
import { distanciaCaminando } from '../maps/client.ts';
import {
  consultarFarmacia,
  descargarMedia,
  enviarBotones,
  enviarTexto,
} from '../whatsapp/client.ts';

/** Centro de Sangolqui. Se usa si el paciente no comparte ubicacion. */
const UBICACION_POR_DEFECTO = { lat: -0.3300, lng: -78.4450 };

/** Cuanto espera el sistema antes de cerrar la solicitud con lo que tenga. */
const ESPERA_MS = 90_000;

/**
 * Nombre que ve el PACIENTE: siempre lo que el mismo escribio o lo que decia
 * su receta (marca, principio activo, tal cual). Nunca se le muestra el
 * nombre "resuelto" del catalogo (ej. no ve "Paracetamol" si el puso
 * "Dolex"): no le interesa la equivalencia, solo quiere su medicina, y
 * cambiarle el nombre en pantalla solo genera desconfianza.
 *
 * El nombre del catalogo (etiqueta(seg)) se sigue usando, aparte, para
 * preguntarle a la FARMACIA, que si necesita el termino que reconoce
 * localmente. Esa traduccion pasa por detras, invisible para el paciente.
 */
function nombreParaPaciente(lectura: LecturaMedicamento, seg: SegmentoMercado): string {
  if (lectura.nombreComercial) {
    const detalle = [lectura.principioActivo, lectura.concentracion].filter(Boolean).join(' ');
    return detalle ? `${lectura.nombreComercial} (${detalle})` : lectura.nombreComercial;
  }
  if (lectura.principioActivo) {
    return [lectura.principioActivo, lectura.concentracion].filter(Boolean).join(' ');
  }
  return lectura.textoCrudo ?? etiqueta(seg);
}

// ─────────── Entrada del paciente ───────────

export async function pacienteEnvioFoto(
  telefono: string,
  mediaId: string
): Promise<void> {
  await enviarTexto(telefono, 'Estoy leyendo tu receta, dame un segundo.');

  const { base64, mimeType } = await descargarMedia(mediaId);
  const lectura = await leerReceta(base64, mimeType);
  await confirmarConPaciente(telefono, lectura);
}

export async function pacienteEnvioTexto(
  telefono: string,
  texto: string
): Promise<void> {
  const lectura = await leerTexto(texto);
  await confirmarConPaciente(telefono, lectura);
}

export async function pacienteCompartioUbicacion(
  telefono: string,
  lat: number,
  lng: number
): Promise<void> {
  const s = store.ultimaDePaciente(telefono);
  if (!s) return;
  s.lat = lat;
  s.lng = lng;
  store.guardar(s);
}

async function confirmarConPaciente(
  telefono: string,
  lectura: LecturaMedicamento
): Promise<void> {
  const seg = resolverSegmento(lectura);

  if (!seg) {
    await enviarTexto(
      telefono,
      'No pude identificar el medicamento. Escribe el nombre tal como aparece ' +
        'en la caja o en la receta, por ejemplo: Enalapril 10 mg.'
    );
    return;
  }

  const textoParaPaciente = nombreParaPaciente(lectura, seg);

  const solicitud: Solicitud = {
    id: randomUUID().slice(0, 8),
    telefonoPaciente: telefono,
    segmentoId: seg.id,
    textoDetectado: textoParaPaciente,
    estado: 'esperando_confirmacion',
    creadaEn: Date.now(),
    lat: UBICACION_POR_DEFECTO.lat,
    lng: UBICACION_POR_DEFECTO.lng,
    consultas: [],
  };
  store.guardar(solicitud);

  await enviarBotones(telefono, `Leí *${textoParaPaciente}*. ¿Es correcto?`, [
    { id: `confirmar:${solicitud.id}`, titulo: 'Sí, buscar' },
    { id: `corregir:${solicitud.id}`, titulo: 'No, corregir' },
  ]);
}

export async function pacienteConfirmo(solicitudId: string): Promise<void> {
  const s = store.obtener(solicitudId);
  if (!s || !s.segmentoId) return;

  const seg = segmentoPorId(s.segmentoId);
  if (!seg) return;

  s.estado = 'consultando';
  store.guardar(s);

  await enviarTexto(
    s.telefonoPaciente,
    'Buscando en farmacias cerca de ti. Te aviso apenas responda alguna.'
  );

  const farmacias = farmaciasActivas();

  // Cada farmacia se procesa de forma aislada: si a una le falla la red,
  // las demas y el cierre de la solicitud igual continuan.
  await Promise.all(
    farmacias.map(async (f) => {
      try {
        const d = await distanciaCaminando(
          { lat: s.lat, lng: s.lng },
          { lat: f.lat, lng: f.lng }
        );

        s.consultas.push({
          farmaciaId: f.id,
          enviadaEn: Date.now(),
          respuesta: 'sin_respuesta',
          distanciaTexto: d.texto,
          distanciaMetros: d.metros,
        });
        store.guardar(s);
        store.marcarConsultaAbierta(f.telefono, s.id);

        await consultarFarmacia(f.telefono, etiqueta(seg), d.texto, s.id);
      } catch (err) {
        console.error(`[orquestador] fallo consultando a ${f.nombre}:`, err);
      }
    })
  );

  setTimeout(() => void cerrarSolicitud(s.id), ESPERA_MS);
}

export async function pacienteCorrigio(solicitudId: string): Promise<void> {
  const s = store.obtener(solicitudId);
  if (!s) return;
  await enviarTexto(
    s.telefonoPaciente,
    'Escribe el nombre del medicamento tal como aparece en la caja.'
  );
}

// ─────────── Respuesta de la farmacia ───────────

export async function farmaciaRespondio(
  telefonoFarmacia: string,
  tiene: boolean
): Promise<void> {
  const s = store.solicitudDeFarmacia(telefonoFarmacia);
  const f = farmaciaPorTelefono(telefonoFarmacia);
  if (!s || !f) return;

  const consulta = s.consultas.find((c) => c.farmaciaId === f.id);
  if (!consulta) return;

  consulta.respuesta = tiene ? 'si_tengo' : 'no_tengo';
  consulta.respondidaEn = Date.now();
  store.guardar(s);

  if (!tiene) {
    await enviarTexto(telefonoFarmacia, 'Gracias por responder.');
    store.cerrarConsulta(telefonoFarmacia);
    await revisarSiYaEstaLista(s.id);
    return;
  }

  await enviarTexto(
    telefonoFarmacia,
    'Gracias. ¿A qué precio lo tienes? Responde solo el número, por ejemplo: 4.80'
  );
}

export async function farmaciaEnvioPrecio(
  telefonoFarmacia: string,
  texto: string
): Promise<boolean> {
  const s = store.solicitudDeFarmacia(telefonoFarmacia);
  const f = farmaciaPorTelefono(telefonoFarmacia);
  if (!s || !f) return false;

  const consulta = s.consultas.find((c) => c.farmaciaId === f.id);
  if (!consulta || consulta.respuesta !== 'si_tengo' || consulta.precio) return false;

  const match = texto.replace(',', '.').match(/\d+(\.\d{1,2})?/);
  if (!match) return false;

  consulta.precio = Number(match[0]);
  store.guardar(s);
  store.cerrarConsulta(telefonoFarmacia);

  await enviarTexto(telefonoFarmacia, 'Listo, ya le avisamos al cliente. Gracias.');
  await revisarSiYaEstaLista(s.id);
  return true;
}

// ─────────── Cierre ───────────

async function revisarSiYaEstaLista(solicitudId: string): Promise<void> {
  const s = store.obtener(solicitudId);
  if (!s || s.estado !== 'consultando') return;

  const pendientes = s.consultas.filter(
    (c) => c.respuesta === 'sin_respuesta' || (c.respuesta === 'si_tengo' && !c.precio)
  );
  if (pendientes.length === 0) await cerrarSolicitud(solicitudId);
}

async function cerrarSolicitud(solicitudId: string): Promise<void> {
  const s = store.obtener(solicitudId);
  if (!s || s.estado !== 'consultando') return;

  const confirmadas = s.consultas
    .filter((c) => c.respuesta === 'si_tengo')
    .sort((a, b) => (a.distanciaMetros ?? 0) - (b.distanciaMetros ?? 0));

  if (confirmadas.length === 0) {
    s.estado = 'sin_resultados';
    store.guardar(s);
    await enviarTexto(
      s.telefonoPaciente,
      'Ninguna farmacia cercana confirmó tenerlo ahorita. ' +
        'Te aviso apenas alguna lo reciba.'
    );
    return;
  }

  s.estado = 'resuelta';
  store.guardar(s);

  const segundos = Math.max(0, Math.round((Date.now() - s.creadaEn) / 1000));
  const lineas = confirmadas.map((c) => {
    const f = farmaciasActivas().find((x) => x.id === c.farmaciaId);
    const precio = c.precio ? ` · $${c.precio.toFixed(2)}` : '';
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
