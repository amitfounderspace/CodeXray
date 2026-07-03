import type { ProjectMap } from "../schema";
import { example } from "./example";

// ── Project registry ──────────────────────────────────────────────────────
// To visualise another codebase: copy example.ts, describe that project's blocks
// + flow, import it here, and add it to PROJECTS. Select it at runtime with
// ?project=<id> (or set NEXT_PUBLIC_PROJECT). Nothing else changes.
export const PROJECTS: Record<string, ProjectMap> = {
  [example.id]: example,
};

export const DEFAULT_PROJECT = example.id;

export function getProject(id?: string | null): ProjectMap {
  return (id && PROJECTS[id]) || PROJECTS[DEFAULT_PROJECT];
}
