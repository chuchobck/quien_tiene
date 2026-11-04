import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ESPERA_CIERRE_MINIMA_MS, ESPERA_CIERRE_POR_DEFECTO_MS, config } from '../src/config.ts';
import { cerrarSolicitud, manejarMensaje } from '../src/core/orquestador.ts';
import { configurarPlanificador, esperaCierreMs, fijarEsperaCierreSimulada } from '../src/core/planificador.ts';
import { fijarStore, store } from '../src/store/index.ts';
import { crearStoreMemoria } from '../src/store/memoria.ts';

describe('delay de cierre del PRODUCTO', () => {
  const previo = process.env.ESPERA_CIERRE_MS;
  afterEach(() => {
    previo === undefined ? delete process.env.ESPERA_CIERRE_MS : (process.env.ESPERA_CIERRE_MS = previo);
    fijarEsperaCierreSimulada(undefined);
  });

  it('por defecto son 90 s y el minimo es 60 s', () => {
    delete process.env.ESPERA_CIERRE_MS;
    expect(ESPERA_CIERRE_POR_DEFECTO_MS).toBe(90_000);
    expect(config.cola.esperaCierreMs).toBe(90_000);
    expect(ESPERA_CIERRE_MINIMA_MS).toBeGreaterThanOrEqual(60_000);
  });
  it('un valor corto en el entorno NO acorta el cierre: se usa el minimo', () => {
    process.env.ESPERA_CIERRE_MS = '2000';
    expect(config.cola.esperaCierreMs).toBe(60_000);
    expect(esperaCierreMs()).toBe(60_000);
  });
  it('valores validos y basura', () => {
    process.env.ESPERA_CIERRE_MS = '120000';
    expect(config.cola.esperaCierreMs).toBe(120_000);
    process.env.ESPERA_CIERRE_MS = 'abc';
    expect(config.cola.esperaCierreMs).toBe(90_000);
  });
  it('la variable del simulador no existe para el producto; solo el hook en proceso lo cambia', () => {
    process.env.SIM_ESPERA_CIERRE_MS = '10';
    expect(esperaCierreMs()).toBe(90_000);
    delete process.env.SIM_ESPERA_CIERRE_MS;
    fijarEsperaCierreSimulada(10);
    expect(esperaCierreMs()).toBe(10);
    fijarEsperaCierreSimulada(undefined);
    expect(esperaCierreMs()).toBe(90_000);
  });
});

describe('cierre anticipado con el delay largo (store en memoria)', () => {
  const programados: { id: string; ms: number }[] = [];
  let n = 0;
  const PACIENTE = '593990000001';
  const msg = (from: string, extra: Record<string, unknown>) => ({ id: `c${++n}`, from, ...extra }) as never;

  beforeEach(() => {
    fijarStore(crearStoreMemoria());
    programados.length = 0;
    configurarPlanificador(async (id, ms) => void programados.push({ id, ms }));
  });

  it('se programa con >= 60 s, y cuando contestan TODAS cierra sin esperar al job', async () => {
    await manejarMensaje(msg(PACIENTE, { type: 'text', text: { body: 'Enalapril 10 mg' } }));
    const id = (await store().ultimaDePaciente(PACIENTE))!.id;
    await manejarMensaje(msg(PACIENTE, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: `confirmar:${id}`, title: 'x' } } }));

    expect(programados).toHaveLength(1);
    expect(programados[0]!.ms).toBeGreaterThanOrEqual(60_000);

    const boton = (tel: string, p: string) => msg(tel, { type: 'button', button: { payload: p } });
    await manejarMensaje(boton('593980000001', 'Sí tengo'));
    await manejarMensaje(msg('593980000001', { type: 'text', text: { body: '4.50' } }));
    await manejarMensaje(boton('593980000002', 'No tengo'));
    expect((await store().obtenerSolicitud(id))!.estado).toBe('consultando'); // falta F3: sigue abierta
    await manejarMensaje(boton('593980000003', 'No tengo'));

    // El job con delay NUNCA corrio (solo se programo) y la solicitud ya cerro.
    expect((await store().obtenerSolicitud(id))!.estado).toBe('resuelta');
    const finales = (await store().salientesDe(PACIENTE)).filter((m) => JSON.stringify(m.cuerpo).includes('tienen *'));
    expect(finales).toHaveLength(1);

    // Cuando el job llegue mas tarde es un no-op: no hay segundo mensaje.
    await cerrarSolicitud(id);
    expect((await store().salientesDe(PACIENTE)).filter((m) => JSON.stringify(m.cuerpo).includes('tienen *'))).toHaveLength(1);
  });
});
