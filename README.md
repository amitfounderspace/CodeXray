# CodeXray

An **independent developer tool** that visualises a codebase as a live system
map — cards are real source files, edges are measured runtime data flow, and the
colour is live traffic/health. It is a standalone Next.js app (a "plug-in" you
point at any instrumented backend).

## How it works

- Renders a ground-truth map from a **project config** in
  [`app/configs/`](app/configs/) (files, dependencies, roles, health), typed by
  [`app/schema.ts`](app/schema.ts).
- Polls the observed backend's `GET /metrics` every second for live edge/route
  traffic and per-block health, and drives a heat view from it.
- Fully decoupled from the app it observes: it only reads HTTP, never imports
  the target's code.

## Selecting a project

The active map is chosen at runtime:

- `?project=<id>` in the URL (e.g. `http://localhost:3001/?project=example`), or
- `NEXT_PUBLIC_PROJECT=<id>` env var,
- otherwise the registry default (`example`).

## Configure the target backend

The dashboard reads `NEXT_PUBLIC_BACKEND_URL` (default `http://localhost:8000`).

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run dev
```

## Run

```bash
npm start        # installs deps if needed, then serves http://localhost:3001
```

Not a coder? See the plain-English [USER_MANUAL.md](USER_MANUAL.md) — or just
double-click `start.command`.

CodeXray renders its static map immediately. To light up **live** traffic and
health, point it at any backend that exposes the `/metrics` + `/logs` endpoints
(see [Zero-setup AI onboarding](#zero-setup-ai-onboarding) to add them
automatically). Until then the dashboard shows a friendly “Connect your repo”
prompt — it never errors.

## Zero-setup AI onboarding

An always-on instruction file lives at
[`.github/copilot-instructions.md`](.github/copilot-instructions.md). The moment you
open this repo, a VS Code AI assistant loads it automatically and knows how to make
CodeXray visualise **your** codebase: it generates a `ProjectMap` config in
`app/configs/`, registers it, and instruments your backend with the `/metrics` +
`/logs` contract. Just ask *"set up CodeXray for my project"* and the assistant does
the rest — no manual wiring required.

## Add another project (the whole extension)

1. Copy [`app/configs/example.ts`](app/configs/example.ts) to
   `app/configs/<yourproject>.ts` and describe that codebase's `columns`,
   `blocks`, and `flow` (conforming to `ProjectMap` in
   [`app/schema.ts`](app/schema.ts)). Optionally set `backendUrl` to that
   project's `/metrics` origin.
2. Import and register it in [`app/configs/index.ts`](app/configs/index.ts).
3. Open `?project=<yourproject>`.

The block `id`s must match the `from->to` edge keys your backend reports to
`/metrics` for the live heat/flow to light up.
