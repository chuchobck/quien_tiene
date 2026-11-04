import { describe, expect, it } from 'vitest';
import type { Medicamento } from '../src/ai/esquema.ts';
import { etiqueta, nombreParaPaciente, resolverSegmentos } from '../src/core/catalogo.ts';
import { crearStoreMemoria } from '../src/store/memoria.ts';

const segmentos = await crearStoreMemoria().segmentos();
const med = (p: Partial<Medicamento>): Medicamento => ({
  active_ingredient: 'x', dose: null, form: null, brand_name: null, raw_text: 'x', confidence: 'high', ...p,
});
const ids = (m: Medicamento) => resolverSegmentos(m, segmentos).map((s) => s.id);

describe('normalizacion de segmentos', () => {
  it('Dolex y Acetaminofen resuelven al segmento de Paracetamol', () => {
    expect(ids(med({ brand_name: 'Dolex', active_ingredient: 'Acetaminofén', dose: '500 mg' }))).toEqual(['paracetamol-500-tab']);
    expect(ids(med({ active_ingredient: 'Acetaminofén', raw_text: 'Acetaminofén' }))).toEqual(['paracetamol-500-tab']);
    expect(ids(med({ active_ingredient: 'Paracetamol', raw_text: 'Paracetamol' }))).toEqual(['paracetamol-500-tab']);
  });
  it('marca comercial sola', () => {
    expect(ids(med({ active_ingredient: 'Renitec', raw_text: 'Renitec' }))).toEqual(['enalapril-10-tab']);
  });
  it('concentracion que no calza descarta el segmento', () => {
    expect(ids(med({ active_ingredient: 'Enalapril', dose: '40 mg' }))).toEqual([]);
  });
  it('lo desconocido no resuelve', () => {
    expect(ids(med({ active_ingredient: 'Zzzmedicina', raw_text: 'Zzzmedicina' }))).toEqual([]);
  });
  it('coloquial: la frase mas especifica gana', () => {
    expect(ids(med({ active_ingredient: 'pastilla de la presion alta', raw_text: 'pastilla de la presion alta' })))
      .toEqual(['losartan-50-tab']);
  });
});

describe('el paciente ve SU termino', () => {
  it('muestra la marca y no el nombre del catalogo', () => {
    const m = med({ brand_name: 'Dolex', active_ingredient: 'Acetaminofén', dose: '500 mg', raw_text: 'Dolex' });
    const visto = nombreParaPaciente(m);
    expect(visto).toBe('Dolex (Acetaminofén 500 mg)');
    expect(visto).not.toMatch(/paracetamol/i);
    const seg = resolverSegmentos(m, segmentos)[0]!;
    expect(etiqueta(seg)).toBe('Paracetamol 500 mg'); // esto solo va a la farmacia
  });
});
