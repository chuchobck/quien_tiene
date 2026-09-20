# Estado del proyecto

Registro append-only. No editar entradas anteriores.

---

## 2026-09-17 — andamiaje inicial

- Estructura completa del proyecto, TypeScript strict, compila limpio.
- Cliente de Meta WhatsApp Cloud API: texto, botones, plantilla, descarga de media.
- Cliente de Gemini para lectura de receta (imagen) y de texto coloquial.
- Cliente de Maps con distancia caminando y respaldo Haversine.
- Catálogo semilla: 15 segmentos de mercado, 5 farmacias (3 activas).
- Orquestador con el flujo completo: foto o texto → confirmación → consulta a
  farmacias → captura de precio → respuesta ordenada al paciente.
- Webhook con verificación de Meta e idempotencia por message.id.
- Store en memoria, aislado tras una sola interfaz.

Verificado: `npm run build` limpio, servidor arranca, webhook responde el
challenge de Meta, el ruteo paciente/farmacia distingue bien, la resolución de
catálogo acierta en directa, marca y coloquial.

Pendiente: probar Gemini contra recetas reales (Fase 0.2) y desplegar en
Cloud Run (Fase 0.3).
