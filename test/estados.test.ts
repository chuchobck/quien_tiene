import { describe, expect, it } from 'vitest';
import { puedeTransicionar, TRANSICIONES } from '../src/core/estados.ts';
import { crearStoreMemoria } from '../src/store/memoria.ts';

describe('maquina de estados', () => {
  it('camino feliz', () => {
    expect(puedeTransicionar('esperando_seleccion', 'esperando_confirmacion')).toBe(true);
    expect(puedeTransicionar('esperando_confirmacion', 'consultando')).toBe(true);
    expect(puedeTransicionar('consultando', 'resuelta')).toBe(true);
    expect(puedeTransicionar('consultando', 'sin_resultados')).toBe(true);
  });
  it('no se saltan pasos ni se reabren estados terminales', () => {
    expect(puedeTransicionar('esperando_seleccion', 'consultando')).toBe(false);
    expect(puedeTransicionar('esperando_confirmacion', 'resuelta')).toBe(false);
    expect(TRANSICIONES.resuelta).toEqual([]);
    expect(TRANSICIONES.sin_resultados).toEqual([]);
  });
  it('transicionar() del store es atomico: solo la primera gana', async () => {
    const s = crearStoreMemoria();
    await s.crearSolicitud({ id: 'a', telefonoPaciente: '1', estado: 'esperando_confirmacion', creadaEn: 1, lat: 0, lng: 0 });
    expect(await s.transicionar('a', 'esperando_confirmacion', 'consultando')).toBe(true);
    expect(await s.transicionar('a', 'esperando_confirmacion', 'consultando')).toBe(false);
  });
});
