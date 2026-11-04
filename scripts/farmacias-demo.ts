/**
 * Pone tus telefonos de prueba en las primeras N farmacias del seed (en la base LOCAL),
 * las deja activas y el resto listadas. No toca data/farmacias.json ni escribe numeros
 * en ningun archivo.
 *
 *   npm run farmacias:demo -- 593XXXXXXXXX 593YYYYYYYYY
 */
import { aplicarFarmaciasDemo } from '../src/store/demo.ts';
import { cerrarPrisma } from '../src/store/prisma.ts';
import { mascararTelefono } from '../src/util/log.ts';

const telefonos = process.argv.slice(2);
if (telefonos.length === 0) {
  console.error('Uso: npm run farmacias:demo -- <tel1> <tel2> ...');
  process.exit(1);
}

try {
  const plan = await aplicarFarmaciasDemo(telefonos);
  console.log('\nFarmacias en la base local (telefonos enmascarados: ultimos 4 digitos):\n');
  for (const p of plan) {
    console.log(`  ${p.id.padEnd(3)} ${p.estado.padEnd(8)} ${mascararTelefono(p.telefono).padEnd(14)} ${p.nombre}${p.asignada ? '   <- tu telefono' : ''}`);
  }
  console.log(`\n${plan.filter((p) => p.asignada).length} activa(s) con tu numero, ${plan.filter((p) => !p.asignada).length} listada(s).`);
  console.log('Recuerda: "npm run db:sembrar" vuelve a poner los telefonos falsos del catalogo.\n');
} catch (err) {
  console.error(`\nNo se cambio nada: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
} finally {
  await cerrarPrisma();
}
