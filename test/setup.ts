// Las pruebas nunca llaman a Meta ni a OSRM, ni leen el .env del desarrollador.
process.env.WHATSAPP_DRY_RUN = 'true';
process.env.OSRM_ACTIVO = 'false';
process.env.RECIPE_PROVIDER = 'mock';
process.env.MODEL_API_KEY = 'clave-de-prueba';
process.env.META_API_BASE_URL = 'https://meta.invalido.test/v1';
