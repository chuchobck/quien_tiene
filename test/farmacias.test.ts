import { describe, expect, it } from 'vitest';
import { aplicarTelefonosActivos } from '../src/core/farmacias.ts';
import { crearStoreMemoria } from '../src/store/memoria.ts';

const todas = await crearStoreMemoria().farmacias();
const activas = (l: typeof todas) => l.filter((f) => f.estado !== 'listada').map((f) => f.id);

describe('ACTIVE_PHARMACY_PHONES', () => {
  it('sin lista, manda el catalogo', () => {
    expect(activas(aplicarTelefonosActivos(todas, undefined))).toEqual(['f1', 'f2', 'f3']);
    expect(activas(aplicarTelefonosActivos(todas, []))).toEqual(['f1', 'f2', 'f3']);
  });
  it('con lista, solo esas; el resto queda listada (aunque el catalogo las tenga activas)', () => {
    expect(activas(aplicarTelefonosActivos(todas, ['593980000002']))).toEqual(['f2']);
  });
  it('ignora +, espacios y guiones; puede activar una farmacia que estaba listada', () => {
    expect(activas(aplicarTelefonosActivos(todas, ['+593 98-0000004', '593980000001']))).toEqual(['f1', 'f4']);
  });
  it('lista con telefonos desconocidos: nadie queda activo', () => {
    expect(activas(aplicarTelefonosActivos(todas, ['593999999999']))).toEqual([]);
  });
  it('no muta la entrada', () => {
    aplicarTelefonosActivos(todas, ['593980000002']);
    expect(activas(todas)).toEqual(['f1', 'f2', 'f3']);
  });
});

import { planificarFarmaciasDemo } from '../src/store/demo.ts';

describe('farmacias:demo (plan puro)', () => {
  it('asigna a las primeras N, activas; el resto listada con su telefono', () => {
    const p = planificarFarmaciasDemo(todas, ['+593 99-1111111', '593992222222']);
    expect(p.map((x) => [x.id, x.estado, x.telefono])).toEqual([
      ['f1', 'activa', '593991111111'],
      ['f2', 'activa', '593992222222'],
      ['f3', 'listada', '593980000003'],
      ['f4', 'listada', '593980000004'],
      ['f5', 'listada', '593980000005'],
    ]);
  });
  it('permite cruzar numeros del seed entre filas tocadas (f1 <- telefono de f2)', () => {
    const p = planificarFarmaciasDemo(todas, ['593980000002', '593980000001']);
    expect(p[0]!.telefono).toBe('593980000002');
  });
  it.each([
    [[], /al menos un/],
    [['123'], /invalido/],
    [['593991111111', '593991111111'], /repetidos/],
    [['593990000001', '593990000002', '593990000003', '593990000004', '593990000005', '593990000006'], /solo tiene 5/],
    [['593980000005'], /ya pertenece a f5/], // f5 no se toca y su telefono es unico
  ])('rechaza pedidos invalidos %#', (args, mensaje) => {
    expect(() => planificarFarmaciasDemo(todas, args as string[])).toThrow(mensaje);
  });
});
