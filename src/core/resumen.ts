import { farmaciasConsultables } from './farmacias.ts';

export async function farmaciasActivasCantidad(): Promise<number> {
  return (await farmaciasConsultables()).length;
}
