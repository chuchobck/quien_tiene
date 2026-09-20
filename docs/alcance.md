# Alcance del producto

Resumen del documento completo. La versión íntegra, con marco legal, fuentes y
modelo de negocio detallado, está en `alcance-v1.0.pdf`.

## El problema

La disponibilidad de medicamentos en la red pública ecuatoriana cayó del 79% en
enero de 2025 al 68% en mayo de 2026. El abastecimiento pasó del 71% al 59%. El
médico deriva al paciente a comprar en farmacia privada, y ahí empieza un
recorrido de horas sin información.

El problema no es la escasez nacional. Es que nadie sabe qué hay en cada vitrina.

## Los dos lados

**Paciente:** camina, gasta pasajes, a veces no encuentra. Recibe a cambio una
búsqueda de minutos, gratis.

**Farmacia de barrio:** es invisible, la gente va a la cadena por defecto, y se
le caduca inventario que sí se vendía. Recibe clientes que jamás la hubieran
encontrado, y datos de demanda real de su zona.

## Estados de una farmacia

| Estado | Cómo entró | En una búsqueda |
|---|---|---|
| Listada | Cargada de registros públicos. No sabe que existe | Aparece en gris. No se le consulta |
| Activa | Reclamada y verificada contra el permiso de ARCSA. Gratis | Recibe consulta, responde con botones |
| Integrada | Inventario conectado. De pago | Responde el sistema solo |

La ficha en gris es el motor de crecimiento: la dueña ve a la de enfrente en
verde llevándose a su cliente.

## Modelo de negocio

Gratis para el paciente, siempre. Del lado farmacia:

| Plan | Precio | Qué compra |
|---|---|---|
| Básico | $0 | Aparecer y recibir clientes, sin tope |
| Conectada | ~$19/mes | Ver su negocio: qué le buscaron y no tenía, avisar a lista de espera |
| Integrada | ~$49/mes | Dejar de responder a mano, stock verificado, alertas de caducidad |

No se cobra por aparecer ni por recibir clientes. Se cobra por inteligencia sobre
el propio negocio y por dejar de trabajar a mano.

**Pagar no da respuesta automática.** El dinero no crea información de stock: el
camino a lo automático se recorre (mes 1 responde todo a mano, mes 3 el sistema
ya la conoce y pregunta menos, mes 6 integra su inventario).

## Límite legal

La plataforma no es una farmacia. No dispensa, no vende, no cobra, no entrega, no
sugiere sustitutos, no da dosis. Mientras se quede ahí no requiere permiso de
ARCSA. Para recetados el flujo termina en "ve con tu receta", nunca en una
transacción.

**Descartado:** alertas de precio sobre el techo legal. La farmacia es el cliente
que paga, y el dato público del MSP es de fiabilidad dudosa.

## Riesgos

1. **Silencio de las farmacias.** Mitigación: puntaje de respuesta; quien no
   contesta baja en el ranking y deja de recibir clientes.
2. **La mentira.** Dice que tiene y no hay. Mitigación: pregunta de seguimiento
   a los 40 minutos, puntaje de veracidad, suspensión a los tres reportes.
3. **Arranque en frío.** Mitigación: un valle, no un país. Valle de los Chillos,
   entre 40 y 60 farmacias.

## Fases posteriores al DevFest

| Fase | Qué |
|---|---|
| 8 | PostgreSQL + PostGIS, sustituyendo `store/` |
| 9 | Cascada por olas real con BullMQ |
| 10 | Puntajes de reputación y veracidad |
| 11 | Catálogo real desde fuente del MSP |
| 12 | Inscripción y primeras 15 farmacias del Valle |
| 13 | Panel de farmacia y planes |
