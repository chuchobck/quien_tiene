import { beforeEach, describe, expect, it } from 'vitest';
import { configurarPlanificador } from '../src/core/planificador.ts';
import { cerrarSolicitud, manejarMensaje } from '../src/core/orquestador.ts';
import { fijarStore, store } from '../src/store/index.ts';
import { crearStoreMemoria } from '../src/store/memoria.ts';
import type { MensajeEntrante } from '../src/whatsapp/tipos.ts';

const PACIENTE = '593990000001';
const F1 = '593980000001';
const F2 = '593980000002';
const F3 = '593980000003';

let n = 0;
const texto = (from: string, body: string): MensajeEntrante => ({ id: `m${++n}`, from, type: 'text', text: { body } });
const imagen = (from: string, id: string): MensajeEntrante => ({ id: `m${++n}`, from, type: 'image', image: { id } });
const boton = (from: string, id: string): MensajeEntrante =>
  ({ id: `m${++n}`, from, type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title: 't' } } });
const plantilla = (from: string, payload: string): MensajeEntrante =>
  ({ id: `m${++n}`, from, type: 'button', button: { payload } });

const cierres: { id: string; ms: number }[] = [];

beforeEach(() => {
  fijarStore(crearStoreMemoria());
  cierres.length = 0;
  configurarPlanificador(async (id, ms) => void cierres.push({ id, ms }));
});

const salientes = async (tel: string) => JSON.stringify((await store().salientesDe(tel)).map((m) => m.cuerpo));
const idSolicitud = async () => (await store().ultimaDePaciente(PACIENTE))!.id;

describe('flujo completo (store en memoria, WhatsApp en dry-run)', () => {
  it('foto Dolex -> confirmar -> farmacias -> precio -> resultado con SU termino', async () => {
    await manejarMensaje(imagen(PACIENTE, 'mock:dolex'));
    let s = (await store().ultimaDePaciente(PACIENTE))!;
    expect(s.estado).toBe('esperando_confirmacion');
    expect(s.textoDetectado).toBe('Dolex (Acetaminofén 500 mg)');

    await manejarMensaje(boton(PACIENTE, `confirmar:${s.id}`));
    s = (await store().obtenerSolicitud(s.id))!;
    expect(s.estado).toBe('consultando');
    expect(s.consultas).toHaveLength(3);
    expect(cierres).toHaveLength(1); // cierre diferido programado
    // A la farmacia se le pregunta con el termino del catalogo
    expect(await salientes(F1)).toContain('Paracetamol 500 mg');

    await manejarMensaje(plantilla(F1, 'Sí tengo')); // boton de plantilla
    await manejarMensaje(texto(F1, '5,12'));
    await manejarMensaje(plantilla(F2, 'No tengo'));
    expect((await store().obtenerSolicitud(s.id))!.estado).toBe('consultando'); // F3 sigue sin contestar

    await cerrarSolicitud(s.id); // llega el job con delay
    s = (await store().obtenerSolicitud(s.id))!;
    expect(s.estado).toBe('resuelta');
    const final = await salientes(PACIENTE);
    expect(final).toContain('Farmacia San Rafael');
    expect(final).toContain('$5.12');
    expect(final).toContain('Recuerda llevar tu receta');
    expect(final).not.toMatch(/Paracetamol/); // el paciente nunca ve el nombre del catalogo
  });

  it('cierra solo cuando ya contestaron todas las farmacias', async () => {
    await manejarMensaje(texto(PACIENTE, 'Enalapril 10 mg'));
    const id = await idSolicitud();
    await manejarMensaje(boton(PACIENTE, `confirmar:${id}`));
    for (const f of [F1, F2, F3]) await manejarMensaje(plantilla(f, 'No tengo'));
    expect((await store().obtenerSolicitud(id))!.estado).toBe('sin_resultados');
    expect(await salientes(PACIENTE)).toContain('Ninguna farmacia cercana');
  });

  it('"no tengo" no se penaliza ni se persigue; y el cierre es idempotente', async () => {
    await manejarMensaje(texto(PACIENTE, 'Enalapril 10 mg'));
    const id = await idSolicitud();
    await manejarMensaje(boton(PACIENTE, `confirmar:${id}`));
    await cerrarSolicitud(id);
    await cerrarSolicitud(id);
    const mensajes = (await store().salientesDe(PACIENTE)).filter((m) => JSON.stringify(m.cuerpo).includes('Ninguna farmacia'));
    expect(mensajes).toHaveLength(1);
  });

  it('doble toque en "Si, buscar" consulta una sola vez', async () => {
    await manejarMensaje(texto(PACIENTE, 'Losartan 50 mg'));
    const id = await idSolicitud();
    await manejarMensaje(boton(PACIENTE, `confirmar:${id}`));
    await manejarMensaje(boton(PACIENTE, `confirmar:${id}`));
    expect(cierres).toHaveLength(1);
    expect((await store().salientesDe(F1)).length).toBe(1);
  });

  it('receta ilegible: pide otra foto, sin crear solicitud', async () => {
    await manejarMensaje(imagen(PACIENTE, 'mock:ilegible'));
    expect(await store().ultimaDePaciente(PACIENTE)).toBeUndefined();
    expect(await salientes(PACIENTE)).toContain('No alcancé a leer');
  });

  it('dos medicamentos: el paciente elige uno (botones, maximo 3)', async () => {
    await manejarMensaje(imagen(PACIENTE, 'mock:dos_medicamentos'));
    let s = (await store().ultimaDePaciente(PACIENTE))!;
    expect(s.estado).toBe('esperando_seleccion');
    expect(s.opciones).toHaveLength(2);
    const ultimo = (await store().salientesDe(PACIENTE)).at(-1)!;
    expect(JSON.stringify(ultimo.cuerpo).match(/"type":"reply"/g)).toHaveLength(2);

    await manejarMensaje(boton(PACIENTE, `elegir:${s.id}:1`));
    s = (await store().obtenerSolicitud(s.id))!;
    expect(s.estado).toBe('esperando_confirmacion');
    expect(s.segmentoId).toBe('metformina-850-tab');
  });

  it('coloquial ambiguo ofrece opciones en vez de elegir por el paciente', async () => {
    await manejarMensaje(texto(PACIENTE, 'la pastilla de la presion'));
    const s = (await store().ultimaDePaciente(PACIENTE))!;
    expect(['esperando_confirmacion', 'esperando_seleccion']).toContain(s.estado);
  });

  it('medicamento desconocido: mensaje amable, sin solicitud', async () => {
    await manejarMensaje(texto(PACIENTE, 'zzzmedicina'));
    expect(await store().ultimaDePaciente(PACIENTE)).toBeUndefined();
    expect(await salientes(PACIENTE)).toContain('No pude identificar');
  });

  it('una farmacia no puede iniciar busquedas con texto', async () => {
    await manejarMensaje(texto(F1, 'Enalapril 10 mg'));
    expect(await store().ultimaDePaciente(F1)).toBeUndefined();
  });
});

describe('falla definitiva del worker', () => {
  it('el paciente recibe un mensaje amable; a una farmacia no se le escribe', async () => {
    const { avisarFalla } = await import('../src/core/orquestador.ts');
    await avisarFalla(texto(PACIENTE, 'x'));
    await avisarFalla(texto(F1, 'x'));
    expect(await salientes(PACIENTE)).toContain('Tuvimos un problema');
    expect((await store().salientesDe(F1)).length).toBe(0);
  });
});

describe('farmacia que contesta despues del cierre', () => {
  const MSG = 'Gracias, esa búsqueda ya cerró.';
  const abrirYCerrar = async () => {
    await manejarMensaje(texto(PACIENTE, 'Enalapril 10 mg'));
    const id = await idSolicitud();
    await manejarMensaje(boton(PACIENTE, `confirmar:${id}`));
    await manejarMensaje(plantilla(F1, 'Sí tengo')); // F1 dice que si, pero no manda precio
    await cerrarSolicitud(id); // F2 y F3 nunca contestaron
    return id;
  };

  it('"Sí tengo" / "No tengo" tarde: recibe el aviso, el paciente no recibe nada nuevo', async () => {
    const id = await abrirYCerrar();
    const delPaciente = (await store().salientesDe(PACIENTE)).length;
    await manejarMensaje(plantilla(F2, 'Sí tengo'));
    await manejarMensaje(texto(F3, 'no tengo'));
    expect(await salientes(F2)).toContain(MSG);
    expect(await salientes(F3)).toContain(MSG);
    expect((await store().obtenerSolicitud(id))!.estado).toBe('resuelta'); // no se reabre
    expect((await store().salientesDe(PACIENTE)).length).toBe(delPaciente);
  });

  it('precio tarde de quien dijo que si: recibe el aviso', async () => {
    await abrirYCerrar();
    await manejarMensaje(texto(F1, '4.80'));
    expect(await salientes(F1)).toContain(MSG);
  });

  it('no avisa si no llego tarde: ya habia respondido y manda un "ok" o un numero', async () => {
    await manejarMensaje(texto(PACIENTE, 'Enalapril 10 mg'));
    const id = await idSolicitud();
    await manejarMensaje(boton(PACIENTE, `confirmar:${id}`));
    await manejarMensaje(plantilla(F1, 'Sí tengo'));
    await manejarMensaje(texto(F1, '5'));
    await manejarMensaje(plantilla(F2, 'No tengo'));
    await cerrarSolicitud(id);
    const antes = (await store().salientesDe(F1)).length;
    await manejarMensaje(texto(F1, 'ok gracias'));
    await manejarMensaje(texto(F1, '6'));
    await manejarMensaje(plantilla(F2, 'No tengo'));
    expect((await store().salientesDe(F1)).length).toBe(antes);
    expect(await salientes(F2)).not.toContain(MSG);
  });

  it('mientras la busqueda sigue abierta, no se dice que cerro', async () => {
    await manejarMensaje(texto(PACIENTE, 'Enalapril 10 mg'));
    await manejarMensaje(boton(PACIENTE, `confirmar:${await idSolicitud()}`));
    await manejarMensaje(plantilla(F1, 'Sí tengo'));
    expect(await salientes(F1)).not.toContain(MSG);
  });
});
