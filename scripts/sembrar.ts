import { sembrarCatalogo } from '../src/store/sembrar.ts';
import { cerrarPrisma } from '../src/store/prisma.ts';

const r = await sembrarCatalogo();
console.log(`Sembrado: ${r.segmentos} segmentos, ${r.farmacias} farmacias.`);
await cerrarPrisma();
