# Arranque — las primeras 2 horas

No escribas código de producto hasta terminar esto. Son los tres experimentos
que pueden tumbar el plan, y necesitas saberlo ahora, no mañana a las 18:00.

---

## 0.1 — Verificar la plantilla de Meta (5 min)

WhatsApp Manager → Plantillas de mensajes → `consulta_stock_farmacia`.

| Estado | Qué hacer |
|---|---|
| Aprobada | `USAR_PLANTILLA=true` en `.env`. Seguir. |
| Rechazada | Reescribir con el ángulo de cuenta existente (abajo) y reenviar. |
| En revisión | `USAR_PLANTILLA=false`. No es bloqueante, ver 0.4. |

Si la rechazan, el texto que suele pasar es:

```
Consulta de disponibilidad para tu farmacia registrada:
¿Tienes {{1}} disponible? Cliente ubicado a {{2}}.
```

La frase "tu farmacia registrada" ancla el mensaje a una relación previa, que es
justo el criterio que Meta busca para la categoría Utilidad.

---

## 0.2 — Gemini contra recetas reales (45 min)

Consigue 5 fotos de recetas manuscritas de verdad.

```bash
npm run probar:gemini -- ~/recetas/receta1.jpg
```

**Criterio de decisión:**

- Acierta en 3 de 5 o más → Gemini es el centro del video, como está planeado.
- Acierta en menos → el demo cambia: el paciente escribe el nombre y Gemini hace
  la normalización de "la pastilla de la presión". Sigue siendo Gemini, sigue
  cumpliendo el requisito, solo es menos espectacular.

Esta era una hipótesis sin validar. Es el momento de validarla.

---

## 0.3 — Cloud Run hello world (45 min, con reloj)

El objetivo no es desplegar la app. Es descubrir si `gcloud` te va a pelear.

```bash
gcloud auth login
gcloud config set project TU_PROYECTO
gcloud run deploy quien-tiene --source . --region us-central1 --allow-unauthenticated
```

**Timebox estricto.** Si a los 45 minutos no está desplegado, plan B: Railway,
que ya conoces, y el video menciona Gemini y Maps como herramientas Google.
Dos herramientas ya cumplen el requisito de sobra.

Cloud Run además resuelve un problema que tienes igual: Meta necesita una URL
HTTPS pública y estable para el webhook. ngrok te la da pero rota.

---

## 0.4 — Farmacias del demo y plan B (20 min)

1. Consigue 3 números de WhatsApp que hagan de farmacia.
2. Agrégalos en Meta como destinatarios de prueba (tienes 5 cupos).
3. Ponlos en `FARMACIAS_DEMO` y en `data/farmacias.json`, con coordenadas
   reales de Sangolquí.

**Plan B si la plantilla no sale a tiempo:** cuando la farmacia le escribe
primero al bot, se abre la ventana de servicio de 24 horas y dentro de esa
ventana mandas mensajes libres sin plantilla. Para el video funciona idéntico.

Coordina con tus tres personas que le escriban "hola" al bot antes de grabar.
Con eso, la aprobación de Meta deja de ser un riesgo.

---

## Después del arranque

| Bloque | Qué |
|---|---|
| Hoy, 3 h | Ajustar el flujo con Claude Code, `npm run dev` + ngrok |
| Hoy, 1 h | Ensayo completo 3 o 4 veces. **Anotar el tiempo real**, es la métrica del video |
| Mañana, 40 min | Visitar 3 farmacias reales en Sangolquí |
| Mañana, 2 h | Grabar |
| Mañana, 1.5 h | Montar video y cerrar README |
| **Mañana 20:00** | **Entregar.** No a las 23:59 |

### La pregunta de la visita

> "Si le llega un WhatsApp preguntando si tiene tal medicina, ¿lo contestaría?"

Con que 2 de 3 digan que sí, tienes la frase que cierra el video y que ningún
otro participante va a tener.

---

## Checklist de entrega

- [ ] Repositorio **público** en GitHub
- [ ] Video de máximo 2 minutos publicado en LinkedIn
- [ ] `#DevFestQuitoChallenge` y etiqueta a `@GDGQuito` en la publicación
- [ ] **Abrir ambos links en ventana de incógnito.** Si pide permiso, no existe
- [ ] Formulario enviado con los dos links
- [ ] Registro en DevFest Quito 2026 confirmado

El paso de la ventana de incógnito es literalmente el más importante de las
36 horas. Un link privado equivale a no haber entregado nada.
