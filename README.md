# ¿Quién Tiene?

**Buscador de disponibilidad de medicinas en farmacias del Ecuador, por WhatsApp.**

Propuesta para el reto INNOVATING TOGETHER — DevFest Quito 2026 · Track Builder

---

## El problema

En Ecuador la disponibilidad de medicamentos en la red pública cayó del 79% en enero de 2025 al 68% en mayo de 2026. Cuatro de cada diez medicamentos planificados no están disponibles, y el médico termina derivando al paciente a comprar en farmacia privada.

Ahí empieza el recorrido: caminar de farmacia en farmacia, llamar, tomar un bus, y la mitad de las veces volver con las manos vacías. Mientras tanto, a cuatro cuadras sí había, en una farmacia de barrio que el paciente no conoce, con la caja en la vitrina esperando a caducarse.

**El problema no es que falte medicina en el país. Es que nadie sabe qué hay en cada vitrina.**

## La solución

Un número de WhatsApp. Mandas foto de tu receta, o escribes el nombre del medicamento, y en menos de un minuto sabes qué farmacias cerca de ti lo tienen ahorita, a qué precio y a qué distancia caminando.

Detrás hay una red de farmacias inscritas que reciben la consulta y responden con un botón.

**Este es un intercambio real, capturado durante las pruebas de este proyecto:**

```
Paciente  → [foto de una receta manuscrita real, con letra de médico]
Sistema   → Estoy leyendo tu receta, dame un segundo.
Sistema   → Leí *Dolex (Acetaminofén 500 mg)*. ¿Es correcto?
Paciente  → Sí, buscar
Sistema   → Buscando en farmacias cerca de ti...

          ⟳ consulta simultánea a las farmacias de la zona

Sistema   → 1 farmacia(s) tienen *Dolex (Acetaminofén 500 mg)*:
            🟢 Farmacia San Rafael · 1.2 km · $5.12
            Encontrado en 68 segundos.
            Recuerda llevar tu receta.
```

Nota el detalle: el paciente escribió y vio "Dolex (Acetaminofén)" del principio al fin. Nunca se le mostró "Paracetamol", aunque es el mismo principio activo y es el término con el que se le preguntó a la farmacia por detrás. El paciente no necesita saber de equivalencias farmacológicas, solo quiere su medicina con el nombre que él conoce.

Sin aplicación que descargar, sin cuenta, sin contraseña. Una persona de 63 años ya sabe usar WhatsApp.

## Herramientas de Google, y dónde exactamente

| Herramienta | Archivo | Qué resuelve |
|---|---|---|
| **Gemini** | [`src/gemini/client.ts`](src/gemini/client.ts) | Lee recetas manuscritas y normaliza lenguaje coloquial. Probado con una receta real de un médico, letra a mano: identificó correctamente principio activo, concentración y marca comercial |
| **Cloud Run** | [`Dockerfile`](Dockerfile) | Backend sin servidor, listo para desplegar. En esta demo el servidor corrió localmente (Node/Fastify) expuesto por túnel durante las pruebas; el contenedor queda listo para el siguiente paso |

El reto pide integrar **al menos una** herramienta de Google. Gemini la cumple de sobra: es el punto más difícil de todo el flujo (letra manuscrita de médico) y es donde un modelo multimodal aporta algo que ninguna otra pieza del sistema podría.

**Sobre la distancia caminando:** se evaluó Google Maps Platform, pero su Distance Matrix API exige vincular una cuenta de facturación activa, algo que no tiene sentido para un MVP de reto estudiantil. Se usa en su lugar el servidor público de [OSRM](http://project-osrm.org) (OpenStreetMap), gratuito y sin clave, con perfil de caminar real, no de manejar. Si esa API pública no responde, el sistema cae a un cálculo aproximado por distancia recta, para que el paciente nunca se quede sin respuesta por culpa de un tercero.

## Arquitectura

```
WhatsApp (paciente)                    WhatsApp (farmacias)
        │                                       ▲
        ▼                                       │
┌───────────────────────────────────────────────────────┐
│  src/whatsapp/webhook.ts   verificación + idempotencia │
├───────────────────────────────────────────────────────┤
│  src/core/orquestador.ts   máquina de estados          │
│     creada → consultando → resuelta | sin_resultados   │
├──────────────┬────────────────┬───────────────────────┤
│ gemini/      │ maps/          │ core/catalogo.ts      │
│ lee receta   │ distancia      │ resuelve al segmento  │
│ (Google)     │ caminando      │ de mercado            │
│              │ (OSRM)         │                        │
├───────────────────────────────────────────────────────┤
│  src/store/  memoria ahora · PostgreSQL + PostGIS después │
└───────────────────────────────────────────────────────┘
```

El **segmento de mercado** (principio activo + concentración + forma) es la clase de equivalencia que ya define la regulación ecuatoriana de precios. El sistema no decide equivalencias por su cuenta: usa las que el Estado ya agrupó, y con eso resuelve tanto sinónimos regionales (Acetaminofén = Paracetamol) como marcas comerciales (Dolex, Renitec, Cozaar) al mismo segmento.

`src/store/` está aislado a propósito. Cambiar memoria por PostgreSQL toca un solo módulo.

## Qué está construido y qué es alcance

Esto es un demo funcional del bucle central, probado de punta a punta con dos números de WhatsApp reales, no el producto terminado. La honestidad sobre esa línea importa:

**Funcionando y probado con tráfico real**
- Webhook de Meta Cloud API con verificación e idempotencia
- Lectura de receta por foto real (letra manuscrita de médico) y por texto coloquial, con Gemini
- El paciente ve siempre su propio término (marca, nombre coloquial); la traducción al nombre que reconoce la farmacia ocurre por detrás, nunca a la vista del paciente
- Resolución al segmento de mercado, incluida equivalencia entre nombres regionales (Acetaminofén/Paracetamol)
- Consulta a farmacias con plantilla aprobada de WhatsApp, con botones de respuesta rápida
- Captura de precio declarado
- Distancia caminando vía OSRM, con respaldo automático si la API externa falla
- Reintento automático ante fallos transitorios de red al leer con Gemini
- Cierre de solicitud y respuesta ordenada al paciente, con tiempo real de resolución

**Fuera de este demo, definido en [`docs/alcance-v1.0.docx`](docs/alcance-v1.0.docx)**
- Cascada por olas con priorización por historial (aquí se consulta a todas las farmacias activas a la vez)
- Puntajes de reputación y veracidad de farmacias
- Persistencia en PostgreSQL + PostGIS
- Catálogo completo (aquí van 16 medicamentos comunes)
- Inscripción de farmacias, panel de estadísticas y planes de suscripción
- Despliegue en Cloud Run (Dockerfile listo, pendiente de desplegar)

## Límite legal

La plataforma **no es una farmacia**. No dispensa, no vende, no cobra, no entrega, no sugiere sustitutos y no da dosis. Es una capa de información y ruteo, y mientras se quede ahí no requiere permiso de ARCSA.

Para todo medicamento recetado el flujo termina siempre igual: *"esta farmacia lo tiene, ve con tu receta"*. Nunca en una transacción.

## Cómo correrlo

Requiere Node 20 o superior.

```bash
git clone <este-repo>
cd quien-tiene
npm install
cp .env.example .env     # llenar las claves (ver abajo)
npm run dev
```

**Claves necesarias en `.env`:**
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`: desde Meta for Developers
- `GEMINI_API_KEY`: gratis en `aistudio.google.com/apikey`, sin tarjeta
- `MAPS_API_KEY`: ya no se usa (se migró a OSRM), se puede dejar vacía

Para exponer el webhook a Meta durante el desarrollo:

```bash
ngrok http 8081
# la URL https va en Meta → WhatsApp → Configuración → Webhook
# el token de verificación debe coincidir con WEBHOOK_VERIFY_TOKEN
```

**Probar Gemini por separado, sin levantar el servidor:**

```bash
npm run probar:gemini -- ruta/a/receta.jpg
npm run probar:gemini -- "la pastilla de la presión"
```

## Estructura

```
src/
├── config.ts           variables de entorno, validación perezosa por seccion
├── types.ts             modelo del dominio
├── whatsapp/            cliente Cloud API + webhook
├── gemini/               lectura de recetas y normalización, con reintento
├── maps/                distancia caminando (OSRM + respaldo)
├── core/                catálogo, orquestador
└── store/               persistencia (memoria → PostgreSQL)
data/
├── medicamentos.json    catálogo semilla
└── farmacias.json       farmacias del piloto
docs/
├── alcance-v1.0.docx     producto completo, modelo de negocio, marco legal
└── 00-arranque.md       guía de arranque y validación del proyecto
```

## Modelo de negocio, en dos líneas

Gratis para el paciente, siempre. La farmacia paga cuando quiere ver la inteligencia sobre su propio negocio: qué le buscaron y no tenía, cuántos clientes recibió, qué se le va a caducar.

Detalle completo en [`docs/alcance-v1.0.docx`](docs/alcance-v1.0.docx).

---

Construido en el Valle de los Chillos, Sangolquí.
