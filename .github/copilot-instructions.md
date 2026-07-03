# CodeXray — AI Onboarding Instructions (always-on)

> This file is loaded automatically into **every** AI assistant request the moment
> this repository is opened. Treat it as a standing mandate: the assistant is
> responsible for making CodeXray able to visualise the surrounding codebase with
> zero manual setup. Keep the facts below in working memory for the whole session.

## What CodeXray is

CodeXray is a **standalone, open-source Next.js dashboard** (runs on port `3001`)
that renders any codebase as a live system map: cards are real source files sized
by importance and coloured by live health; edges are measured runtime traffic.

It is **fully decoupled** from the code it observes — it only reads HTTP
(`GET /metrics`, `GET /logs`) and **never imports the target's source**. All the
knowledge it needs comes from two things the assistant must produce:

1. A **ProjectMap** config file describing the target codebase (static structure).
2. A **`/metrics` + `/logs` HTTP contract** exposed by the target's backend (live data).

## Your mandate on first run / clone

When a user clones this repo alongside their project and runs it, you MUST, without
being asked again, help them reach a working dashboard by producing the files below.
If any already exist, reconcile/extend them instead of duplicating.

Do this proactively when the user says anything like *"set up CodeXray"*, *"make the
dashboard show my app"*, *"why is CodeXray empty/offline"*, or *"add my project"*.

### Deliverable 1 — ProjectMap config  → `app/configs/<projectId>.ts`

Explore the target repo (imports = `deps`, call sites = `flow`) and emit one config
that conforms exactly to `ProjectMap` in [`app/schema.ts`](../app/schema.ts). Use
[`app/configs/example.ts`](../app/configs/example.ts) as the reference template.

Required shape (do not invent extra keys):

```ts
import type { ProjectMap } from "../schema";

export const <projectId>: ProjectMap = {
  id: "<projectId>",            // stable key used in ?project=<projectId>
  name: "<Human Readable Name>",
  backendUrl: "http://localhost:8000", // optional; omit to use NEXT_PUBLIC_BACKEND_URL
  columns: [ /* left→right swimlanes */
    { title: "Browser UI", subtitle: "what the user sees" },
    // ...one per architectural layer (col index 0..N)
  ],
  blocks: [ /* one per real source file / external system */
    {
      id: "unique-id",          // MUST match the /metrics edge keys (see contract)
      label: "file.ts",         // filename shown on the card
      file: "path/to/file.ts",  // repo-relative path
      kind: "React Context",    // short tech tag
      col: 0,                   // which swimlane (0-based)
      weight: 3,                // 1..5 — bigger = more critical = bigger card
      status: "ok",             // "ok" | "risk" | "down" (static default)
      statusNote: "why this colour right now",
      role: "plain-English: what it does",
      why: "plain-English: why it matters",
      deps: ["other-block-id"], // ids this block imports/depends on
    },
    // ...
  ],
  flow: [ /* the numbered runtime journey */
    { from: "block-a", to: "block-b", step: 1, label: "what data travels" },
    // ...
  ],
};
```

Rules:
- Every `deps[]` and every `flow.from`/`flow.to` MUST reference a real `block.id`.
- `col` values must have matching entries in `columns` (0-based, left→right).
- Derive `deps` from actual `import`/`require` statements; derive `flow` from the
  real request path (entry point → … → data/model), ordered by `step`.

### Deliverable 2 — Register the project  → `app/configs/index.ts`

Import the new config and add it to the `PROJECTS` registry so it can be selected
with `?project=<projectId>` (or `NEXT_PUBLIC_PROJECT`). Do not change `page.tsx`.

```ts
import { example } from "./example";
import { <projectId> } from "./<projectId>";
export const PROJECTS: Record<string, ProjectMap> = {
  [example.id]: example,
  [<projectId>.id]: <projectId>,
};
```

### Deliverable 3 — Instrument the target backend  → `/metrics` + `/logs`

Add (or extend) two **read-only** HTTP endpoints on the target's backend. They must
be CORS-enabled for the dashboard origin (`http://localhost:3001`). The dashboard
polls `/metrics` every second.

**`GET /metrics`** returns this exact JSON shape:

```jsonc
{
  "now": 1730000000.0,                 // epoch SECONDS (float), server clock
  "edges": {                            // key = "<fromBlockId>-><toBlockId>"
    "block-a->block-b": {
      "count": 12,                       // times this hop fired
      "bytes": 34567,                    // total payload bytes over the hop
      "errors": 0,
      "last_ts": 1730000000.0,           // epoch seconds of last hop (drives "hot")
      "last_ms": 8.3                     // last hop duration (ms)
    }
  },
  "routes": { "POST /compile": { /* same stat shape */ } },
  "blocks": { "block-a": "ok", "block-b": "risk" } // id -> "ok"|"risk"|"down"
}
```

- **Edge keys are `"${from}->${to}"` using the block `id`s from Deliverable 1** —
  this is what lights up the live heat/flow. Mismatched ids = no live traffic shown.
- `blocks` here **overrides** the static `status` in the config at runtime.
- Keep it **in-memory and process-global** (no database); reset on restart is fine.

**`GET /logs?after=<seq>`** returns recent backend log lines newer than a cursor:

```jsonc
{ "entries": [
  { "seq": 42, "t": 1730000000000.0, "level": "INFO",
    "logger": "app.live", "message": "Handshake received" }
] }
```

- `seq` is a monotonically increasing cursor; the client sends the last `seq` it saw
  as `?after=`. `t` is epoch **milliseconds** (matches JS `Date`).
- Filter out polling noise (drop lines mentioning `/metrics` and `/logs`).

Reference pattern to mirror (framework-agnostic): keep an in-process, thread-safe
registry that (1) increments a counter per hop/route with byte + timing totals, and
(2) buffers the last N log records in a ring buffer exposed via `/logs?after=<seq>`.
Expose both as plain read-only HTTP handlers on the target's existing web server.

## Hard constraints

- **Never import or bundle the target's code into CodeXray.** The only coupling is
  HTTP. CodeXray must keep working (showing a static map, panel `OFFLINE`) even when
  the backend is down — never introduce a build-time dependency on the target.
- **Do not edit `app/page.tsx`, `app/schema.ts`, or `app/MermaidView.tsx`** to add a
  project; everything project-specific lives in `app/configs/`.
- Instrumentation must be **non-invasive and read-only**: counters/log capture only,
  no behavioural changes to the observed app.
- Match the JSON contracts **exactly** (key names, `now` in seconds, `t` in ms).

## Verify before declaring done

1. `npm --prefix <path-to-CodeXray> run dev` → dashboard serves on `http://localhost:3001`.
2. Open `http://localhost:3001/?project=<projectId>` → the map renders every block.
3. With the target backend running, `curl http://localhost:8000/metrics` returns the
   contract JSON, and the dashboard's status pill flips to **LIVE** with edges heating.
4. Exercise the app once; confirm the correct edges/routes light up and `/logs` streams.
