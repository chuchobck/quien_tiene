// Las pruebas nunca llaman a Meta ni a OSRM, ni leen el .env del desarrollador.
process.env.WHATSAPP_DRY_RUN = 'true';
process.env.OSRM_ACTIVO = 'false';
process.env.ACTIVE_PHARMACY_PHONES = ''; // las pruebas no dependen del .env del desarrollador
process.env.RECIPE_PROVIDER = 'mock';
process.env.MODEL_API_KEY = 'clave-de-prueba';
process.env.META_API_BASE_URL = 'https://meta.invalido.test/v1';
