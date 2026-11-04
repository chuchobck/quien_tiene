import { crearStorePrisma } from './prisma.ts';
import type { Store } from './tipos.ts';

export type { Store, FilaDemanda, MensajeSaliente } from './tipos.ts';

let actual: Store | undefined;

/** Unica puerta a los datos. Por defecto Prisma/PostgreSQL. */
export function store(): Store {
  actual ??= crearStorePrisma();
  return actual;
}

/** Solo para pruebas: inyecta otra implementacion (memoria). */
export function fijarStore(s: Store | undefined): void {
  actual = s;
}
