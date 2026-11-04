/**
 * Prueba el proveedor de IA elegido por RECIPE_PROVIDER, sin servidor.
 *   npm run probar:ia -- ruta/receta.jpg
 *   npm run probar:ia -- "la pastilla de la presion"
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { lectorDeRecetas } from '../src/ai/index.ts';
import { etiqueta, resolverSegmentos } from '../src/core/catalogo.ts';
import { crearStoreMemoria } from '../src/store/memoria.ts';

const arg = process.argv[2];
if (!arg) {
  console.error('Uso: probar-ia.ts <ruta-imagen | "texto">');
  process.exit(1);
}
const MIMES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const mime = MIMES[extname(arg).toLowerCase()];
const lector = lectorDeRecetas();

const t0 = performance.now();
const ext = mime ? await lector.readImage(readFileSync(arg), mime) : await lector.readText(arg);
const ms = Math.round(performance.now() - t0);

console.log(`\n── Lectura (${lector.nombre}, ${ms} ms) ──`);
console.log(JSON.stringify(ext, null, 2));

const segmentos = await crearStoreMemoria().segmentos();
console.log('\n── Resolucion en catalogo ──');
for (const m of ext.medications) {
  const r = resolverSegmentos(m, segmentos);
  console.log(`${m.raw_text} -> ${r.length ? r.map(etiqueta).join(' | ') : 'NO resuelto'}`);
}
