/**
 * Logs con teléfonos enmascarados: solo se ven los últimos 4 dígitos.
 * Ningún log del sistema debe llevar un número completo.
 */
export function mascararTelefono(telefono: string): string {
  const d = telefono.replace(/\D/g, '');
  if (d.length <= 4) return '****';
  return `${'*'.repeat(d.length - 4)}${d.slice(-4)}`;
}

/** Enmascara cualquier secuencia que parezca un teléfono dentro de un texto libre. */
export function mascararEnTexto(texto: string): string {
  return texto.replace(/\b\d{9,15}\b/g, (m) => mascararTelefono(m));
}

type Nivel = 'info' | 'warn' | 'error';

function emitir(nivel: Nivel, mensaje: string, extra?: unknown): void {
  const linea = `[${nivel}] ${mascararEnTexto(mensaje)}`;
  const salida = nivel === 'info' ? console.log : console.error;
  if (extra === undefined) return salida(linea);
  const detalle = extra instanceof Error ? extra.message : JSON.stringify(extra);
  salida(`${linea} ${mascararEnTexto(detalle ?? '')}`);
}

export const log = {
  info: (m: string, extra?: unknown) => emitir('info', m, extra),
  warn: (m: string, extra?: unknown) => emitir('warn', m, extra),
  error: (m: string, extra?: unknown) => emitir('error', m, extra),
};
