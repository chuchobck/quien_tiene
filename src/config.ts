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
  whatsappDryRun: {
    get activo() {
      return opt('WHATSAPP_DRY_RUN', 'false') === 'true';
    },
  },
  db: {
    get url() {
      return req('DATABASE_URL');
    },
    get redisUrl() {
      return opt('REDIS_URL', 'redis://localhost:6379');
    },
  },
  recetas: {
    get proveedor(): 'mock' | 'gemini' | 'meta' {
      const v = opt('RECIPE_PROVIDER', 'mock');
      if (v !== 'mock' && v !== 'gemini' && v !== 'meta') {
        throw new Error(`RECIPE_PROVIDER invalido: "${v}". Usa mock, gemini o meta.`);
      }
      return v;
    },
  },
  meta: {
    get apiKey() {
      return req('META_API_KEY');
    },
    get baseUrl() {
      return opt('META_API_BASE_URL', 'https://dev.meta.ai').replace(/\/+$/, '');
    },
    get modelo() {
      return opt('META_MODEL', 'muse-spark-1.1');
    },
    /** Ruta del endpoint de chat. UNVERIFIED: configurable por si la documentacion difiere. */
    get rutaChat() {
      return opt('META_API_CHAT_PATH', '/v1/chat/completions');
    },
    /** Pedir response_format json_object. UNVERIFIED: apagado por defecto. */
    get modoJson() {
      return opt('META_JSON_MODE', 'false') === 'true';
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
    /** OSRM_ACTIVO=false fuerza el Haversine (simulaciones sin red, pruebas). */
    get usarOsrm() {
      return opt('OSRM_ACTIVO', 'true') === 'true';
    },
  },
  cola: {
    /** El worker arranca junto al servidor salvo WORKER_EMBEBIDO=false (entonces: npm run worker). */
    get workerEmbebido() {
      return opt('WORKER_EMBEBIDO', 'true') === 'true';
    },
    /** Espera antes de cerrar una solicitud con lo que haya. */
    get esperaCierreMs() {
      return Number(opt('ESPERA_CIERRE_MS', '90000'));
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