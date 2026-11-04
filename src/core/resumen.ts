import { store } from '../store/index.ts';

export async function farmaciasActivasCantidad(): Promise<number> {
  return (await store().farmacias()).filter((f) => f.estado !== 'listada').length;
}
