# Mockroom: AI Interview Simulator

Candidates upload a résumé, configure an interview, take an AI-led interview by voice, camera or text, and review an evidence-linked report. Recruiters see only reports a candidate chose to share. Administrators manage providers, usage, audit history and retention.

**Demo mode is the default.** With no API keys the app runs on a built-in mock provider and mock speech adapters. Mock output is labelled "Demo" everywhere and is a keyword heuristic, not live AI analysis.

## Quick start

Requires Node 22+.

```bash
npm install
cp .env.example .env.local      # names and placeholders only
npm run db:migrate              # creates ./data/app.db (SQLite) from migrations/
npm run db:seed                 # demo accounts, sample roles, one completed demo interview
npm run dev                     # http://localhost:3000
```

Demo sign-ins (password `DemoPass12345`, development only; the seed refuses to run in production):

| Role | Email |
|---|---|
| Candidate | demo.candidate@example.com |
| Recruiter | demo.recruiter@example.com |
| Admin | demo.admin@example.com |

Production build: `npm run build && npm start`. Reset local data: `npm run db:reset`.

## Environment variables

| Variable | Purpose |
|---|---|
| `APP_SECRET` | Required in production (16+ chars). Encrypts provider API keys stored by the admin screen (AES-256-GCM). |
| `DATABASE_PATH`, `UPLOAD_DIR` | SQLite file and résumé storage directory. |
| `APP_ORIGIN` | Public origin used for the CSRF origin check. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | Optional. Leave blank to stay on the mock provider. Keys stay server-side and are never returned to the browser. |
| `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL` | `local` (deterministic hashing, default) or `openai`. |
| `DEMO_MODE` | `false` only once real providers are configured. |
| `RATE_LIMIT_DISABLED` | `1` only for automated tests. |

## Architecture

A single Next.js 16 / TypeScript application (App Router) with versioned route handlers under `/api/v1`. The domain logic lives in `src/server`:

- `ai/`: provider-agnostic contract (`generateResponse`, `streamResponse`, `generateInterviewQuestion`, `evaluateAnswer`, `generateFeedback`, `healthCheck`) with OpenAI, Anthropic, Gemini and mock adapters. Timeouts, bounded retries and rate-limit handling live in the base adapter. `router.ts` applies the default provider and an **opt-in** fallback, and refuses fallback to a provider not approved for candidate data or lacking a needed capability. Fallbacks are audited.
- `resume/`: validation (extension, MIME, size, real file signature), PDF/DOCX/TXT extraction, section detection, section-aware chunking, embeddings, hybrid retrieval (cosine + keyword), prompt-injection flagging and neutralisation. Retrieval selects by `owner_id` inside the query, so ownership is enforced on every call.
- `interview/`: state machine (CREATED → PREPARING → IN_PROGRESS ⇄ PAUSED → COMPLETED, plus CANCELLED and recoverable FAILED), question/answer flow, evaluation, report builder, and neutral session-event recording.
- `speech/`: speech-to-text and text-to-speech adapters (mock, OpenAI). The browser's own speech recognition is used for live captions where available.
- `auth.ts`, `http.ts`, `ratelimit.ts`, `audit.ts`, `privacy.ts`: sessions, role and ownership checks, CSRF origin check, rate limiting, audit log, export, deletion and retention sweeps.

Data is in SQLite (`migrations/001_init.sql`: users, organizations, memberships, résumés and chunks, templates, sessions, questions, answers, transcript segments, evaluations, session events, provider configuration, usage, audit, consent). Résumé files are stored under `UPLOAD_DIR` and never in relational columns.

### Deliberate deviations from the brief

The brief suggested FastAPI, PostgreSQL and pgvector "unless a strong reason suggests otherwise". This build uses one TypeScript service with SQLite and in-process vector search, because the repository was empty, the requirement is to run locally without extra infrastructure, and one runtime keeps the vertical slice verifiable. Moving to Postgres/pgvector, object storage and a job queue is listed under production readiness. There is no WebSocket layer: live updates use fetch plus an event stream route, and the room re-hydrates from persisted state after a reload or dropped connection.

## Design

The UI follows the Apple design reference supplied with the task (`docs/apple-design-reference.md`): single Action Blue accent, alternating light/dark surfaces, pill actions, SF Pro with Inter fallback, a single shadow reserved for imagery, no decorative gradients. Contrast was audited with axe-core and the failures it found (dark surfaces, link buttons) were fixed.

## Privacy, integrity and fairness

- Camera and microphone are optional. Text-only mode uses the same questions and rubric, and declining audio or video never lowers a score.
- Camera checks run in the browser only (dark or frozen picture, no face in frame). No video is uploaded or recorded. There is no emotion, gaze, identity or personality inference.
- Session-integrity events (tab hidden, focus lost, connection lost, optional fullscreen/paste length) require consent and a per-interview policy. They are stored as neutral observations labelled "unverified signal", shown to the candidate, can be contested, are excluded from scoring code, and never rank or reject anyone.
- Ratings are AI-assisted estimates. Reviewers can override a score; decisions need a qualified human. Compliance with privacy and employment law is a deployment requirement, not something this software certifies.
- Users can export their data, delete a résumé (vectors included) or their whole account. `npm run retention:sweep` applies the configured retention windows.

## Tests

```bash
npm run typecheck
npm test               # vitest: 26 unit/integration tests on an isolated temp database
npm run build
npm run test:e2e       # Playwright (Chromium) against the production build on port 3100, seeded e2e DB
```

The e2e suite writes screenshots to `screenshots/` and runs axe-core (WCAG 2.1 AA, serious/critical) on the landing, setup, lobby, room, results, settings and recruiter pages. If Playwright cannot find a browser, set `CHROMIUM_PATH` to a Chromium binary.

## Deploying a public demo (free, for a portfolio link)

`render.yaml` is a Render Blueprint for a **demo-only** deployment: mock AI provider, fake seed data, free plan.

1. Push this repository to GitHub (private is fine).
2. On render.com choose **New → Blueprint**, connect the repository, and apply `render.yaml`.
3. When the build finishes, open the `https://<name>.onrender.com` address Render shows.

Notes: the free plan has no persistent disk, so the database is recreated and re-seeded on every start and anything visitors create is lost on restart. Free services sleep when idle, so the first visit can take about a minute. Visitors can sign in with the demo accounts listed above. Do not add real provider keys to a public demo, and do not upload real personal documents to it. `ALLOW_DEMO_SEED=true` exists only for this case: the seed refuses to run in production without it.

## Deployment (real use)

Set `APP_SECRET`, `APP_ORIGIN`, `DEMO_MODE=false`, provider keys (or enter them in `/admin/providers`), and persistent volumes for `DATABASE_PATH` and `UPLOAD_DIR`. Serve over HTTPS and run `npm run db:migrate` on release. Do not run `db:seed` in production. The rate limiter is per-process; use a shared store when running more than one instance.

## Troubleshooting

- `better-sqlite3` fails to load: reinstall with `npm rebuild better-sqlite3` on the target Node version.
- Port in use: `PORT` is fixed in scripts; edit `package.json` or stop the other process.
- Microphone blocked: the room falls back to typed answers; check the browser's site permissions.
- Everything shows "Demo": expected until a real provider is enabled by an admin.

## Known limitations

- Real OpenAI/Anthropic/Gemini adapters and OpenAI speech were **not exercised** (no credentials). Only the mock path, error handling and fallback logic were tested.
- Mock scoring is keyword-based and cannot judge answer quality.
- Scanned (image-only) PDFs are detected and reported as unreadable; OCR is not included.
- Recruiter pages cover reports shared by candidates; there is no organization admin or invitation flow.
- E2E runs on desktop Chromium only; the mobile and tablet checks are viewport emulation, not real devices. Real microphone/camera capture was tested only for the permission-denied path.
