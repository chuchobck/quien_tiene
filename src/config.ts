import 'dotenv/config';

function req(clave: string): string {
  const valor = process.env[clave];
  if (!valor || valor.trim() === '') {
    throw new Error(
      `Falta la variable de entorno ${clave}. Copia .env.example a .env y llenala.`
    );
  }
  return valor.trim();
}

function opt(clave: string, porDefecto: string): string {
  const valor = process.env[clave];
  return valor && valor.trim() !== '' ? valor.trim() : porDefecto;
}

/**
 * Cada sección valida solo cuando se lee, no al importar el modulo.
 * Asi "probar:gemini" no exige tener WHATSAPP_TOKEN ni MAPS_API_KEY:
 * solo toca config.gemini, y eso es lo unico que se valida.
 */
export const config = {
  whatsapp: {
    get token() {
      return req('WHATSAPP_TOKEN');
    },
    get phoneNumberId() {
      return req('WHATSAPP_PHONE_NUMBER_ID');
    },
    get apiVersion() {
      return opt('WHATSAPP_API_VERSION', 'v23.0');
    },
    get verifyToken() {
      return req('WEBHOOK_VERIFY_TOKEN');
    },
    get usarPlantilla() {
      return opt('USAR_PLANTILLA', 'true') === 'true';
    },
    get nombrePlantilla() {
      return opt('NOMBRE_PLANTILLA', 'consulta_stock_farmacia');
    },
    get idiomaPlantilla() {
      return opt('IDIOMA_PLANTILLA', 'es');
    },
  },
  gemini: {
    get apiKey() {
      return req('GEMINI_API_KEY');
    },
    get modelo() {
      return opt('GEMINI_MODEL', 'gemini-3.6-flash');
    },
  },
  maps: {
    get apiKey() {
      return req('MAPS_API_KEY');
    },
  },
  servidor: {
    get puerto() {
      return Number(opt('PORT', '8080'));
    },
    get host() {
      return opt('HOST', '0.0.0.0');
    },
  },
  get farmaciasDemo(): string[] {
    return opt('FARMACIAS_DEMO', '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
  },
};