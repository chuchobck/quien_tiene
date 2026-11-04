# ¿Quién Tiene? — Who Has It?

**A WhatsApp search for medicine availability in Ecuadorian pharmacies.**
Built solo for the Meta Global AI Developer Hackathon (Cerebral Valley + Meta), Independent Developer track.

License: [MIT](LICENSE) · User-facing text is in Ecuadorian Spanish on purpose; the code comments too.

> **Honesty rule for this README:** it only describes what exists and was tested.
> Anything not built is under [Plan](#plan-not-built). Anything that could not be
> verified is marked **unverified**.

---

## The problem

Public-network medicine availability in Ecuador fell from 79% (Jan 2025) to 68% (May 2026), so doctors send patients to buy at private pharmacies. Then the patient walks pharmacy to pharmacy with no information, while a neighborhood pharmacy a few blocks away may have the box sitting on the shelf.

The problem isn't national scarcity. **Nobody knows what is on each shelf.** The product is that data (what medicine is in which pharmacy); WhatsApp is only the interface.

## The flow

```
Patient  → [photo of a prescription]  or  "la pastilla de la presión"
Bot      → Leí *Dolex (Acetaminofén 500 mg)*. ¿Es correcto?     [Sí, buscar] [No, corregir]
Patient  → Sí, buscar
          ⟳ the active pharmacies are asked, each answers with a button (+ price)
Bot      → 1 farmacia(s) tienen *Dolex (Acetaminofén 500 mg)*:
           🟢 Farmacia San Rafael · 808 m · $5.12
           Recuerda llevar tu receta.
```

(The exchange above is output from the **simulation** with the **mock** AI provider, see below. It is not a real chat.)

Product rules enforced in code and prompts: never suggest a substitute, dose or treatment; never close a transaction (it always ends in "take your prescription"); the patient never pays; the patient always sees **their own** term (they typed "Dolex" → they see "Dolex", never "Paracetamol"; the catalog name is only used behind the scenes to ask the pharmacy); "no tengo" is a valuable answer, silence is what gets penalized. If a prescription lists several medicines, the patient picks one (max 3 buttons).

## Architecture

```
 WhatsApp (patient / pharmacy)
          │  Meta Cloud API webhook
          ▼
 ┌──────────────────────────┐   dedupe by message.id (InboundMessage, unique)
 │ Fastify  /webhook        │──► enqueue ──► Redis (BullMQ "mensajes")      → 200 immediately
 └──────────────────────────┘                          │
                                                       ▼
                                          ┌─────────────────────────┐
                                          │ Worker (npm run worker) │  retries + backoff,
                                          │  core/orquestador.ts    │  failed set = dead-letter,
                                          └──┬───────┬──────────┬───┘  friendly error to patient
                                             │       │          │
                              ai/ RecipeReader   maps/ (OSRM     store/ (Prisma → PostgreSQL)
                              mock | gemini |    + Haversine
                              meta (unverified)  fallback)
                                             │
                          delayed job "cierres" (BullMQ) closes the request with what came back
```

More detail in [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## Built and tested vs. plan

### Built and tested (this is what the evidence below covers)

Verified by `npm test` (53 tests, vitest) and `npm run simular` (end-to-end, no phones), run against **PostgreSQL 16 and Redis 7 installed locally with apt**:

- Webhook that validates, dedupes by WhatsApp `message.id` and enqueues; replies 200 first. Handles `text`, `image`, `location`, `interactive` and template quick-reply `button` messages.
- BullMQ worker (separate process or embedded), retries with backoff, failed jobs kept as dead-letter, friendly message to the patient when retries run out (unit-tested; no live failure drill).
- The 90 s close is now a BullMQ delayed job (simulation uses 2.5 s).
- Request state machine with atomic transitions (a double tap on "Sí, buscar" queries pharmacies once).
- `RecipeReader` interface with zod-validated output; **mock** provider with fixtures (illegible, two medicines, colloquial).
- Segment normalization (Dolex / Acetaminofén → Paracetamol 500 mg) and ambiguity handling (the patient chooses, the system doesn't).
- Prisma schema + migration + seed (15 medicine segments, 5 pharmacies; 3 active) on PostgreSQL.
- `WHATSAPP_DRY_RUN=true`: outbound messages go to the console and the `OutboundMessage` table instead of Meta.
- Phone numbers are masked (last 4 digits) in application logs.
- Minimal demand view: `GET /farmacias/:id/demanda` (JSON) and `/farmacias/:id/demanda/pagina` (HTML, "Qué te buscaron y no tenías"): aggregated counts per medicine over 7 days, no patient data. It has **no authentication**, and the data is simulation data.

### What these tests do NOT prove

- **Meta Model API adapter: partially unverified.** No API key yet, and the official docs were not reachable from the build environment. Taken as given by the author (not checked by me): base URL `https://api.meta.ai/v1` (`dev.meta.ai` is the portal, not the API), `Authorization: Bearer`, OpenAI-compatible `POST /chat/completions` and `POST /responses`. **Unverified:** the image format (two modes via `META_IMAGE_MODE`: `chat` = `image_url` data URL on `/chat/completions`, `responses` = `input_image` on `/responses`), the exact response shape, how reasoning blocks look (the adapter ignores them and validates only the final text), and `META_REASONING_EFFORT`. See the `UNVERIFIED` banner in [`src/ai/meta.ts`](src/ai/meta.ts). Its tests use a simulated `fetch` and only check our routing, retry, validation and reasoning-discard logic, not the real API. Checklist for the key: [`docs/MANANA.md`](docs/MANANA.md).
- **No real prescription image has been read by any provider in this hackathon build.** The only provider exercised end to end is the mock.
- The live WhatsApp send path (non-dry-run) was not re-tested after this refactor.
- `docker-compose.yml` is **untested**: the build sandbox had the Docker CLI but no daemon. The `Dockerfile` is also untested.
- No response-time figures are claimed: the simulation uses a mock and has no network latency to measure.

### AI provider used in the demo

**Not yet decided/measured.** Until a real run is done, the only verified provider is `mock`. This line will be updated with the provider and the measured time after the live run (checklist in `docs/MANANA.md`).

### Plan (not built)

- Waves/cascade of pharmacy queries prioritized by history (today every active pharmacy is asked at once)
- Reputation and truthfulness scores; follow-up question after a "sí tengo"
- Webhook signature verification (`X-Hub-Signature-256`)
- Pharmacy onboarding, authenticated pharmacy panel, subscription plans
- Full medicine catalog (today: 15 segments)
- PostGIS, deployment (Cloud Run or other)

## Run it in 3 commands

Requires Node 20+ and PostgreSQL 16 + Redis 7 (`docker compose up -d` provides them, untested; or local services).

```bash
npm install && cp .env.example .env && docker compose up -d
npx prisma migrate deploy && npm run db:sembrar
npm run simular     # end-to-end with fake webhooks, mock AI, dry-run WhatsApp
```

Other commands: `npm run dev` (server + embedded worker), `npm run worker` (separate worker, with `WORKER_EMBEBIDO=false` on the server), `npm test`, `npm run typecheck`, `npm run probar:ia -- "texto" | ruta/receta.jpg`.

Config: see [`.env.example`](.env.example). `RECIPE_PROVIDER=mock|gemini|meta`. For Meta: `MODEL_API_KEY` (alias `META_API_KEY`), `META_API_BASE_URL`, `META_MODEL` (default `muse-spark-1.1`), `META_IMAGE_MODE=chat|responses`, optional `META_REASONING_EFFORT`.

## Transparency: what existed before the hackathon

A prototype existed before this hackathon (DevFest Quito 2026, Sept 2026, 2 commits: `86133fd`, `964bc49`): Fastify + WhatsApp Cloud API + **Gemini** + OSRM, in-memory store, a `setTimeout` close, no tests. Its README reported tests with real WhatsApp traffic and a handwritten prescription; that was not re-verified here.

**Done during the hackathon** (see the git history after `964bc49`): public-repo hygiene and MIT license, PostgreSQL + Prisma, Redis + BullMQ, the `RecipeReader` abstraction with mock / Gemini / Meta providers, multi-medicine selection, dry-run mode, the simulation script, the vitest suite and the demand view.

## Legal boundary

The platform is not a pharmacy: it doesn't dispense, sell, charge, deliver, suggest substitutes or give doses. For prescription medicine the flow always ends in "this pharmacy has it, go with your prescription".

## License

[MIT](LICENSE).
