// Shared, project-agnostic shapes for the CodeXray tool.
//
// A ProjectMap is everything the dashboard needs to visualise ONE codebase:
// its swimlanes (columns), its blocks (source files / systems), and the runtime
// data flow between them. Drop a new ProjectMap into app/configs/ to add another
// project — no changes to page.tsx required.

export type BlockStatus = "ok" | "risk" | "down";

export interface Block {
  id: string;
  label: string;
  file: string;
  kind: string; // short tech tag e.g. "React Context", "FastAPI route"
  col: number;
  weight: number; // 1..5 — bigger = more important = bigger card
  status: BlockStatus; // static default; live /metrics can override it
  statusNote: string; // why this colour right now
  role: string; // plain-English: what it does
  why: string; // plain-English: why it matters
  deps: string[]; // ids this block imports / depends on (structural)
}

export interface FlowEdge {
  from: string;
  to: string;
  step: number; // ordering of the runtime journey
  label: string; // what data travels
}

export interface Column {
  title: string;
  subtitle: string;
}

export interface ProjectMap {
  id: string; // stable key used in the ?project= URL param
  name: string; // human label shown in the header
  backendUrl?: string; // optional per-project /metrics origin; falls back to env
  columns: Column[];
  blocks: Block[];
  flow: FlowEdge[];
}
