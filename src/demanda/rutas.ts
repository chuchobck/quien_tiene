import type { FastifyInstance } from 'fastify';
import { store } from '../store/index.ts';

const DIAS = 7;
const MS_DIA = 86_400_000;

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Demanda de los ultimos 7 dias para una farmacia. SOLO agregados por
 * segmento: la salida jamas incluye telefonos ni ids de solicitud.
 */
export async function calcularDemanda(farmaciaId: string, ahora = Date.now()) {
  const farmacia = await store().farmaciaPorId(farmaciaId);
  if (!farmacia) return undefined;
  const [filas, segmentos] = await Promise.all([
    store().demandaDeFarmacia(farmaciaId, ahora - DIAS * MS_DIA),
    store().segmentos(),
  ]);
  const porId = new Map(segmentos.map((s) => [s.id, s]));
  const items = filas
    .map((f) => {
      const s = porId.get(f.segmentoId);
      return {
        segmento: s ? `${s.principioActivo} ${s.concentracion}` : f.segmentoId,
        busquedas: f.busquedas,
        noTenias: f.noTenia,
        sinRespuesta: f.sinRespuesta,
        teniasYRespondiste: f.siTenia,
      };
    })
    .sort((a, b) => b.noTenias - a.noTenias || b.busquedas - a.busquedas);
  return { farmacia: farmacia.nombre, ventanaDias: DIAS, items };
}

export function registrarDemanda(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>('/farmacias/:id/demanda', async (req, reply) => {
    const d = await calcularDemanda(req.params.id);
    return d ?? reply.code(404).send({ error: 'Farmacia no encontrada' });
  });

  app.get<{ Params: { id: string } }>('/farmacias/:id/demanda/pagina', async (req, reply) => {
    const d = await calcularDemanda(req.params.id);
    if (!d) return reply.code(404).send('Farmacia no encontrada');
    const filas = d.items.length
      ? d.items
          .map(
            (i) =>
              `<tr><td>${escapar(i.segmento)}</td><td>${i.noTenias}</td><td>${i.sinRespuesta}</td><td>${i.busquedas}</td></tr>`
          )
          .join('')
      : '<tr><td colspan="4">Todavía no hay búsquedas en los últimos 7 días.</td></tr>';
    return reply.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Qué te buscaron y no tenías</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;color:#1a1a1a}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.5rem;border-bottom:1px solid #ddd}
th:not(:first-child),td:not(:first-child){text-align:right}small{color:#666}</style></head><body>
<h1>Qué te buscaron y no tenías</h1>
<p><strong>${escapar(d.farmacia)}</strong> · últimos ${d.ventanaDias} días</p>
<table><thead><tr><th>Medicamento</th><th>No tenías</th><th>Sin respuesta</th><th>Búsquedas</th></tr></thead>
<tbody>${filas}</tbody></table>
<p><small>Solo conteos agregados: no se muestra quién buscó. Datos del demo, no son de una farmacia real.</small></p>
</body></html>`);
  });
}
