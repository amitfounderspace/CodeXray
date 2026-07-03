// EXAMPLE / DEMO project config — ships as the default so a fresh clone renders
// something immediately. It maps a fictional "MyApp" full-stack web application.
//
// To visualise YOUR codebase:
//   1. Copy this file to app/configs/<yourproject>.ts
//   2. Replace every block with your real source files (imports = deps, call sites = flow)
//   3. Import and register it in ./index.ts
//   4. Open ?project=<yourproject> in the browser
//
// status:  "ok"   -> working as expected (green)
//          "risk" -> works but fragile / at-risk (orange)
//          "down" -> broken / not performing right now (red)
// weight:  1..5    -> bigger number = more important/critical = bigger card.
// col:     0..N    -> left-to-right swimlane (must match a columns[] entry).

import type { Block, Column, FlowEdge, ProjectMap } from "../schema";

// ── Swimlanes (column headers) ────────────────────────────────────────────
const COLUMNS: Column[] = [
  { title: "Browser UI", subtitle: "what the user sees" },
  { title: "API Server", subtitle: "Express routes · business logic" },
  { title: "Data Layer", subtitle: "models · database · cache" },
];

// ── Blocks (every real source file / external system) ─────────────────────
const BLOCKS: Block[] = [
  // col 0 — Browser UI
  {
    id: "app-tsx",
    label: "App.tsx",
    file: "src/App.tsx",
    kind: "React root",
    col: 0,
    weight: 3,
    status: "ok",
    statusNote: "Renders correctly. Router and global state wired up.",
    role: "Root component. Mounts the router, wraps the app in global providers, and renders the top-level page layout.",
    why: "Every page component is a child of this — if it breaks, nothing renders.",
    deps: ["pages-tsx", "api-client"],
  },
  {
    id: "pages-tsx",
    label: "pages/",
    file: "src/pages/",
    kind: "React pages",
    col: 0,
    weight: 4,
    status: "ok",
    statusNote: "All routes responding. Form validation passing.",
    role: "Page components for each route (Home, Dashboard, Settings). Own their local UI state and delegate data fetching to the API client.",
    why: "These are the screens users interact with — all user-facing behaviour lives here.",
    deps: ["api-client"],
  },

  // col 1 — API Server
  {
    id: "api-client",
    label: "apiClient.ts",
    file: "src/lib/apiClient.ts",
    kind: "HTTP client",
    col: 1,
    weight: 3,
    status: "ok",
    statusNote: "Axios instance with base URL and auth header injection.",
    role: "Centralised HTTP client. Wraps every backend call, attaches auth tokens, and normalises error responses before they reach UI components.",
    why: "Decouples every page from raw fetch logic — change the backend URL or auth scheme here once.",
    deps: ["server-ts"],
  },
  {
    id: "server-ts",
    label: "server.ts",
    file: "server/server.ts",
    kind: "Express app",
    col: 1,
    weight: 4,
    status: "ok",
    statusNote: "Running on port 8000. CORS and JSON middleware active.",
    role: "Entry point for the backend. Creates the Express app, registers CORS/JSON middleware, mounts the API router, and starts listening.",
    why: "All HTTP traffic enters here — without it the frontend has no backend to talk to.",
    deps: ["routes-ts", "db"],
  },
  {
    id: "routes-ts",
    label: "routes.ts",
    file: "server/routes.ts",
    kind: "Express router",
    col: 1,
    weight: 3,
    status: "ok",
    statusNote: "GET /items and POST /items both responding with correct status codes.",
    role: "Defines all API routes (GET /items, POST /items, DELETE /items/:id). Validates request bodies and delegates to model functions.",
    why: "This is the public contract between frontend and backend — breaking it breaks the app.",
    deps: ["model-ts"],
  },

  // col 2 — Data Layer
  {
    id: "model-ts",
    label: "model.ts",
    file: "server/model.ts",
    kind: "Data model",
    col: 2,
    weight: 3,
    status: "ok",
    statusNote: "CRUD operations stable. No N+1 queries detected.",
    role: "Business logic and data access. Implements create/read/update/delete operations using the database connection, encapsulating all query logic.",
    why: "Keeps SQL/ORM details out of route handlers — the single source of truth for what the data looks like.",
    deps: ["db"],
  },
  {
    id: "db",
    label: "db.ts",
    file: "server/db.ts",
    kind: "DB connection",
    col: 2,
    weight: 2,
    status: "ok",
    statusNote: "Connection pool healthy. Query latency within SLA.",
    role: "Opens and exports a shared database connection pool. Handles reconnection on failure and exposes a typed query helper.",
    why: "Every data operation depends on this. A broken pool = total backend failure.",
    deps: [],
  },
];

// ── Flow (the numbered runtime journey) ───────────────────────────────────
const FLOW: FlowEdge[] = [
  {
    from: "pages-tsx",
    to: "api-client",
    step: 1,
    label: "fetch('/items') on page mount",
  },
  {
    from: "api-client",
    to: "server-ts",
    step: 2,
    label: "GET http://localhost:8000/items",
  },
  {
    from: "server-ts",
    to: "routes-ts",
    step: 3,
    label: "router dispatches GET /items handler",
  },
  {
    from: "routes-ts",
    to: "model-ts",
    step: 4,
    label: "model.getAll() called",
  },
  {
    from: "model-ts",
    to: "db",
    step: 5,
    label: "SELECT * FROM items",
  },
  {
    from: "db",
    to: "model-ts",
    step: 6,
    label: "rows returned",
  },
  {
    from: "model-ts",
    to: "routes-ts",
    step: 7,
    label: "array of item objects",
  },
  {
    from: "routes-ts",
    to: "api-client",
    step: 8,
    label: "200 JSON response",
  },
  {
    from: "api-client",
    to: "pages-tsx",
    step: 9,
    label: "resolved promise → setState(items)",
  },
];

// ── ProjectMap export ─────────────────────────────────────────────────────
export const example: ProjectMap = {
  id: "example",
  name: "MyApp — Example Full-Stack App",
  backendUrl: "http://localhost:8000",
  columns: COLUMNS,
  blocks: BLOCKS,
  flow: FLOW,
};
