/**
 * Simulacion end-to-end SIN telefonos: arranca servidor + worker en este proceso,
 * postea webhooks falsos y verifica lo que recibe cada "telefono" (tabla OutboundMessage).
 * Requiere Postgres y Redis (docker compose up -d, o servicios locales).
 *
 *   npm run simular
 *
 * No prueba a Meta ni a ningun proveedor de IA real: usa RECIPE_PROVIDER=mock
 * y WHATSAPP_DRY_RUN=true. Lo que verifica es NUESTRO flujo.
 */
process.env.WHATSAPP_DRY_RUN = 'true';
process.env.RECIPE_PROVIDER = 'mock';
process.env.ACTIVE_PHARMACY_PHONES = ''; // la simulacion usa las 3 farmacias falsas del catalogo
process.env.OSRM_ACTIVO = 'false';
// Corto (no 90 s) pero holgado: el job con delay cierra "con lo que haya". Si el delay vence ANTES de que
// F1/F2 contesten, el producto cierra bien (paciente recibe "Ninguna farmacia...") y esta simulacion
// pierde su premisa; por eso se detecta y se reporta aparte (ver "cierre prematuro" mas abajo).
// Variable PROPIA del simulador (SIM_...): ESPERA_CIERRE_MS es del producto y tiene un minimo de 60 s.
const ESPERA_CIERRE_MS = Number(process.env.SIM_ESPERA_CIERRE_MS ?? '12000');
process.env.WEBHOOK_VERIFY_TOKEN ??= 'simulacion';

const { crearApp } = await import('../src/app.ts');
const { iniciarWorkers, cerrarCola } = await import('../src/cola/index.ts');
const { store } = await import('../src/store/index.ts');
const { sembrarCatalogo } = await import('../src/store/sembrar.ts');
const { fijarEsperaCierreSimulada } = await import('../src/core/planificador.ts');
const { cerrarPrisma } = await import('../src/store/prisma.ts');

const F1 = '593980000001'; // Farmacia San Rafael: tiene, a $5.12
const F2 = '593980000002'; // Botica La Salud: no tiene
// F3 (593980000003) no contesta: se cierra por el job con delay.
const PACIENTE = `59399${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const F3 = '593980000003';
const PACIENTE3 = `59399${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const PACIENTE2 = `59399${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const corrida = Date.now();
let contador = 0;
let fallos = 0;

const paso = (t: string) => console.log(`\n▶ ${t}`);
function verificar(ok: boolean, descripcion: string): void {
  console.log(`  ${ok ? '✔' : '✘'} ${descripcion}`);
  if (!ok) fallos++;
}

fijarEsperaCierreSimulada(ESPERA_CIERRE_MS); // solo en este proceso
await sembrarCatalogo();
const app = crearApp(false);
await app.listen({ port: 0, host: '127.0.0.1' });
const puerto = (app.server.address() as { port: number }).port;
const detener = iniciarWorkers();

async function webhook(mensaje: Record<string, unknown>, id?: string): Promise<string> {
  const wamid = id ?? `wamid.sim-${corrida}-${++contador}`;
  const res = await fetch(`http://127.0.0.1:${puerto}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: wamid, ...mensaje }] } }] }] }),
  });
  if (res.status !== 200) throw new Error(`el webhook respondio ${res.status}`);
  return wamid;
}

const imagen = (from: string, media: string) => ({ from, type: 'image', image: { id: media } });
const texto = (from: string, body: string) => ({ from, type: 'text', text: { body } });
const botonPropio = (from: string, id: string) => ({ from, type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title: 'x' } } });
const botonPlantilla = (from: string, payload: string) => ({ from, type: 'button', button: { payload, text: payload } });

/**
 * Las farmacias son las mismas en cada corrida: sus mensajes viejos no cuentan.
 * Se anota hasta que id de OutboundMessage habia al arrancar.
 */
const base = new Map<string, number>();
for (const t of [F1, F2, F3, PACIENTE, PACIENTE2, PACIENTE3]) base.set(t, (await store().salientesDe(t)).at(-1)?.id ?? 0);

/** Espera hasta que el telefono reciba un saliente NUEVO cuyo cuerpo cumpla `contiene`. */
async function esperar(telefono: string, contiene: string, ms = 15_000): Promise<string | undefined> {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    const m = (await store().salientesDe(telefono, base.get(telefono) ?? 0)).map((x) => JSON.stringify(x.cuerpo)).find((c) => c.includes(contiene));
    if (m) return m;
    await new Promise((r) => setTimeout(r, 150));
  }
  return undefined;
}

/** Diagnostico: todos los salientes NUEVOS de un telefono, en orden, con hora. */
async function volcarSalientes(telefono: string, titulo: string): Promise<void> {
  console.log(`\n  ── ${titulo} ──`);
  for (const m of await store().salientesDe(telefono, base.get(telefono) ?? 0)) {
    const c = m.cuerpo as { text?: { body?: string }; interactive?: { body?: { text?: string } } };
    const t = (c.text?.body ?? c.interactive?.body?.text ?? '').replace(/\n/g, ' | ');
    console.log(`  #${m.id} ${new Date(m.creadoEn).toISOString().slice(11, 23)} ${m.tipo.padEnd(11)} ${t.slice(0, 110)}`);
  }
}

try {
  paso('Escenario 1: foto (mock) -> confirmacion -> farmacias -> precio -> cierre por job con delay');
  await webhook(imagen(PACIENTE, 'mock:dolex'));
  const conf = await esperar(PACIENTE, 'Es correcto');
  verificar(Boolean(conf?.includes('Dolex (Acetaminofén 500 mg)')), 'el paciente ve SU termino: "Dolex (Acetaminofén 500 mg)"');
  verificar(!conf?.includes('Paracetamol'), 'no se le muestra "Paracetamol"');

  const sol = await store().ultimaDePaciente(PACIENTE);
  const tConfirmo = Date.now();
  await webhook(botonPropio(PACIENTE, `confirmar:${sol!.id}`));
  const aF1 = await esperar(F1, 'Paracetamol 500 mg');
  verificar(Boolean(aF1), 'la farmacia recibe la consulta con el termino del catalogo');

  await webhook(botonPlantilla(F1, 'Sí tengo')); // boton de PLANTILLA (type: "button")
  verificar(Boolean(await esperar(F1, 'A qué precio')), 'F1 toco "Sí tengo" (plantilla) y se le pide el precio');
  await webhook(texto(F1, '5,12'));
  await webhook(botonPlantilla(F2, 'No tengo'));
  const tRespondieron = Date.now() - tConfirmo;
  const final = await esperar(PACIENTE, 'tienen *Dolex', ESPERA_CIERRE_MS + 15_000);
  const cierrePrematuro = await esperar(PACIENTE, 'Ninguna farmacia cercana', 500);
  if (!final && cierrePrematuro) {
    console.log(
      `  ⚠ CIERRE PREMATURO (premisa de la simulacion rota, no un fallo del producto): el delay de ` +
        `${ESPERA_CIERRE_MS} ms vencio antes de que F1/F2 contestaran (tardaron ${tRespondieron} ms). ` +
        `Sube SIM_ESPERA_CIERRE_MS.`
    );
  }
  verificar(Boolean(final), 'el paciente recibe el resultado (F3 no contesto: cerro el job con delay)');
  verificar(Boolean(final?.includes('Farmacia San Rafael') && final.includes('$5.12')), 'incluye farmacia y precio');
  verificar(Boolean(final?.includes('Recuerda llevar tu receta')), 'termina en "lleva tu receta", sin transaccion');
  console.log(`  mensaje final: ${final ? (JSON.parse(final) as { text: { body: string } }).text.body.replace(/\n/g, ' | ') : '—'}`);

  await volcarSalientes(PACIENTE, 'salientes del paciente, escenario 1');
  paso('Escenario 2: receta con dos medicamentos -> el paciente elige uno');
  await webhook(imagen(PACIENTE2, 'mock:dos_medicamentos'));
  const opciones = await esperar(PACIENTE2, 'varios medicamentos');
  verificar(Boolean(opciones) && (opciones!.match(/"type":"reply"/g) ?? []).length === 2, 'recibe 2 botones de eleccion');
  const sol2 = await store().ultimaDePaciente(PACIENTE2);
  await webhook(botonPropio(PACIENTE2, `elegir:${sol2!.id}:0`));
  verificar(Boolean(await esperar(PACIENTE2, 'Es correcto')), 'tras elegir, pide confirmacion');

  paso('Escenario 3: idempotencia (Meta reintenta el mismo message.id)');
  const antes = (await store().salientesDe(PACIENTE2)).length;
  const id = await webhook(texto(PACIENTE2, 'Enalapril 10 mg'));
  for (let i = 0; i < 100 && (await store().salientesDe(PACIENTE2)).length === antes; i++) {
    await new Promise((r) => setTimeout(r, 150));
  }
  const medio = (await store().salientesDe(PACIENTE2)).length;
  await webhook(texto(PACIENTE2, 'Enalapril 10 mg'), id);
  await new Promise((r) => setTimeout(r, 1500));
  const despues = (await store().salientesDe(PACIENTE2)).length;
  verificar(medio > antes, 'el primer envio genero respuesta');
  verificar(despues === medio, 'el reintento con el mismo id NO genero mensajes duplicados');

  paso('Escenario 4: demanda agregada, sin identificar al paciente');
  const res = await fetch(`http://127.0.0.1:${puerto}/farmacias/f2/demanda`);
  const demanda = (await res.json()) as { items: { segmento: string; noTenias: number }[] };
  const fila = demanda.items.find((i) => i.segmento.startsWith('Paracetamol'));
  verificar(Boolean(fila && fila.noTenias >= 1), 'F2 ve que le buscaron Paracetamol y no tenia');
  verificar(!JSON.stringify(demanda).includes(PACIENTE), 'la respuesta no contiene el telefono del paciente');

  paso('Escenario 5: cierre ANTICIPADO (contestan todas las farmacias activas, el delay NO se espera)');
  await webhook(texto(PACIENTE3, 'Losartan 50 mg'));
  await esperar(PACIENTE3, 'Es correcto');
  const sol3 = await store().ultimaDePaciente(PACIENTE3);
  const t5 = Date.now();
  await webhook(botonPropio(PACIENTE3, `confirmar:${sol3!.id}`));
  await esperar(F3, 'Losartan');
  await webhook(botonPlantilla(F1, 'No tengo'));
  await webhook(botonPlantilla(F2, 'No tengo'));
  await webhook(botonPlantilla(F3, 'No tengo'));
  const cerro = await esperar(PACIENTE3, 'Ninguna farmacia cercana', ESPERA_CIERRE_MS);
  const tardo = Date.now() - t5;
  verificar(Boolean(cerro), 'el paciente recibe el cierre');
  // Relativo al delay de ESTA simulacion y a ESTA maquina; no prueba nada del reloj de otra.
  verificar(tardo < ESPERA_CIERRE_MS / 2, `cerro por contestar todas (${tardo} ms), no por el delay (${ESPERA_CIERRE_MS} ms)`);
} finally {
  await detener();
  await app.close();
  await cerrarCola();
  await cerrarPrisma();
}

console.log(fallos === 0 ? '\n✅ Simulacion completa: todo verificado.' : `\n❌ ${fallos} verificacion(es) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
