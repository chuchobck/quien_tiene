export interface MensajeEntrante {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  image?: { id: string };
  location?: { latitude: number; longitude: number };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  /**
   * Boton de RESPUESTA RAPIDA pegado a una PLANTILLA aprobada. Distinto de
   * "interactive": ese es para los botones que este servidor arma con
   * enviarBotones(). Este lo manda Meta cuando la farmacia toca "Si tengo" /
   * "No tengo" en el mensaje de plantilla.
   */
  button?: { text?: string; payload?: string };
}
