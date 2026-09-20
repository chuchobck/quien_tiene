/**
 * FASE 0.2 — Probar Gemini con recetas reales ANTES de construir nada.
 *
 *   node --experimental-strip-types scripts/probar-gemini.ts ruta/receta.jpg
 *   node --experimental-strip-types scripts/probar-gemini.ts "la pastilla de la presion"
 *
 * Criterio: si acierta en 3 de 5 recetas, Gemini es el centro del video.
 * Si no, el demo cambia a que el paciente escriba el nombre.
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { leerReceta, leerTexto } from '../src/gemini/client.ts';
import { resolverSegmento, etiqueta } from '../src/core/catalogo.ts';

const arg = process.argv[2];
if (!arg) {
  console.error('Uso: probar-gemini.ts <ruta-imagen | "texto">');
  process.exit(1);
}

const MIMES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const ext = extname(arg).toLowerCase();
const esImagen = ext in MIMES;

const lectura = esImagen
  ? await leerReceta(readFileSync(arg).toString('base64'), MIMES[ext]!)
  : await leerTexto(arg);

console.log('\n── Lectura de Gemini ──');
console.log(JSON.stringify(lectura, null, 2));

const seg = resolverSegmento(lectura);
console.log('\n── Resolucion en catalogo ──');
console.log(seg ? `OK: ${etiqueta(seg)}  (segmento ${seg.id})` : 'NO resuelto');
console.log('');
