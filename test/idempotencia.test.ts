import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fijarStore } from '../src/store/index.ts';
import { crearStoreMemoria } from '../src/store/memoria.ts';

const encolar = vi.fn(async () => undefined);
vi.mock('../src/cola/index.ts', () => ({ encolarMensaje: encolar }));

const { registrarWebhook, extraerMensajes } = await import('../src/whatsapp/webhook.ts');

const cuerpo = (id: string) => ({
  entry: [{ changes: [{ value: { messages: [{ id, from: '593990000001', type: 'text', text: { body: 'hola' } }] } }] }],
});

beforeEach(() => {
  fijarStore(crearStoreMemoria());
  encolar.mockClear();
});

describe('webhook idempotente', () => {
  it('el mismo message.id dos veces encola una sola vez y siempre responde 200', async () => {
    const app = Fastify();
    registrarWebhook(app);
    for (let i = 0; i < 2; i++) {
      const r = await app.inject({ method: 'POST', url: '/webhook', payload: cuerpo('wamid.A') });
      expect(r.statusCode).toBe(200);
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(encolar).toHaveBeenCalledTimes(1);
    await app.inject({ method: 'POST', url: '/webhook', payload: cuerpo('wamid.B') });
    await new Promise((r) => setTimeout(r, 50));
    expect(encolar).toHaveBeenCalledTimes(2);
  });

  it('si encolar falla, el id se olvida para que el reintento de Meta entre', async () => {
    const app = Fastify();
    registrarWebhook(app);
    encolar.mockRejectedValueOnce(new Error('redis caido'));
    await app.inject({ method: 'POST', url: '/webhook', payload: cuerpo('wamid.C') });
    await new Promise((r) => setTimeout(r, 50));
    await app.inject({ method: 'POST', url: '/webhook', payload: cuerpo('wamid.C') });
    await new Promise((r) => setTimeout(r, 50));
    expect(encolar).toHaveBeenCalledTimes(2);
  });

  it('cuerpos mal formados no revientan', async () => {
    const app = Fastify();
    registrarWebhook(app);
    expect(extraerMensajes({ entry: [{ changes: [{ value: { messages: [{ type: 'text' }] } }] }] })).toEqual([]);
    expect((await app.inject({ method: 'POST', url: '/webhook', payload: { basura: true } })).statusCode).toBe(200);
  });
});
