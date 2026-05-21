# IDP — Intelligent Document Processing SaaS

A multi-tenant SaaS prototype where companies upload documents (invoices, IDs, contracts, receipts, forms) and get structured JSON back from an async processing pipeline.

This repo is my submission for the SaaS Architecture & Intelligent Document Processing task.

Stack:

- **Backend:** NestJS 11 + TypeScript, Prisma, PostgreSQL, Redis, BullMQ
- **Frontend:** Next.js 16 (App Router) + Tailwind
- **OCR:** Tesseract, running as its own microservice
- **Infra:** Docker Compose (postgres, redis, ocr, api, worker, frontend)

The full architecture write-up for Part 1 is in [docs/architecture.md](docs/architecture.md).

## Quick start

You only need Docker + Docker Compose.

```bash
git clone <repo-url> idp-saas && cd idp-saas

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

docker compose up --build
```

The first run pulls images and builds, so give it ~5 minutes. On boot the API
syncs the DB schema and seeds the demo tenant + user (the seed is idempotent, so
it's safe on restarts).

Once it's up:

| Service     | URL                            |
| ----------- | ------------------------------ |
| Frontend    | http://localhost:3000          |
| API         | http://localhost:3001/api/v1   |
| Swagger     | http://localhost:3001/api/docs |
| OCR service | http://localhost:4000/health   |

`docker compose down` to stop, `docker compose down -v` to also wipe the data.

## Demo login

```
Tenant slug:  demo
Email:        admin@demo.com
Password:     Demo1234!
```

Or just register a fresh tenant at http://localhost:3000/register.

## Using the API

Everything is in Swagger at `/api/docs`. A few examples:

## How it fits together

```
Browser / API client  →  Next.js (3000)  →  NestJS API (3001)  →  Postgres
                                                  │
                                          BullMQ on Redis
                                                  │
                                          Worker (same image, separate process)
                                                  │
                              ┌───────────────────┴───────────────────┐
                              ↓                                       ↓
                  OCR microservice (Tesseract, 4000)      Local disk uploads (S3 in prod)
```

A few of the decisions behind this (the architecture doc goes into the why):

- **Modular monolith** — one deployable, but with real module boundaries so a
  module can be pulled out into its own service later.
- **Shared-schema multi-tenancy, enforced at the ORM layer.** `forTenant(tenantId)`
  returns a Prisma client that scopes every query. App code can't leak across
  tenants even if a handler forgets to filter.
- **Separate worker process** — same image, different command. Scales on its own.
- **OCR as a standalone service.** Tesseract runs in its own container; the
  worker calls it over HTTP, so OCR load doesn't touch the API.
- **Storage behind an interface** — swap `LocalStorageService` for an S3 one
  without touching callers.
- **Deny-by-default auth** — the JWT guard is global; public routes opt out
  explicitly.

## Project layout

```
backend/
  prisma/
    schema.prisma     Tenants, Users, ApiKeys, Documents
    seed.ts           demo tenant + user
  src/
    main.ts           API entry — helmet, CORS, ValidationPipe, Swagger
    worker.ts         worker entry — BullMQ consumers, no HTTP
    app.module.ts     global guards, filters, interceptors
    config/           typed config + Joi env validation
    common/           decorators, guards, filters, interceptors
    prisma/           tenant-scoped Prisma client extension
    storage/          StorageService interface + local-disk impl
    modules/
      auth/           register, login, refresh, JWT strategy
      documents/      upload, list, get-one
      processing/     BullMQ producer + processor (calls the OCR service)
      health/         liveness/readiness
frontend/
  app/                login, register, dashboard, document detail
  lib/api.ts          fetch wrapper, token handling, auto-refresh
ocr/
  server.js           Express wrapper around the Tesseract CLI
docs/
  architecture.md          the architecture write-up
  architecture-diagram.md. the architecture diagram write-up
docker-compose.yml
```

## Configuration

All env vars are in `backend/.env.example` and `frontend/.env.example`. The
backend validates its environment at boot with Joi and won't start if something
is missing or malformed.

## Tests

```bash
cd backend
npm test
npm run test:cov
```

There's a unit test for the auth service in
`backend/src/modules/auth/auth.service.spec.ts` — it mocks Prisma and covers
register/login including the bcrypt path. The same pattern would extend to the
other modules; I didn't have time to cover all of them.

## Dummy vs Real

| Area                | Status     | Notes                                                                                                |
| ------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| Auth                | Real       | JWT, bcrypt, refresh tokens, roles                                                                   |
| Tenant isolation    | Real       | Enforced at the Prisma client layer                                                                  |
| Upload + validation | Real       | Size + MIME + magic-byte checks, tenant-prefixed storage                                             |
| Queue + worker      | Real       | BullMQ, retries, exponential backoff, separate process                                               |
| OCR                 | Real       | Tesseract as a standalone service. Images only — PDFs are rejected (would need a rasterization step) |
| Object storage      | Local disk | Behind `StorageService` — swap to S3 by changing one provider binding                                |
| Virus scanning      | Not built  | Noted as a ClamAV pipeline step in the architecture doc                                              |
| Webhooks            | Not built  | Schema + HMAC approach described in the architecture doc                                             |
| Logging             | Real       | JSON, request-id propagation, tenant id per line                                                     |
| Rate limiting       | Real       | Per-route, Redis-backed                                                                              |
| Swagger             | Real       | Auto-generated at `/api/docs`                                                                        |

## What I'd harden before real customers

More detail in architecture doc, but roughly:

- Refresh-token rotation + server-side revocation (right now refresh tokens are stateless)
- ClamAV scan as a pipeline step
- S3 (SSE-KMS) with pre-signed direct uploads
- Webhook subscriptions with HMAC signing
- Audit log
- Real observability stack (Prometheus / Grafana / OpenTelemetry / Sentry)
- Proper e2e + load testing in CI
