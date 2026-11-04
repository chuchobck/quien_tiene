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
