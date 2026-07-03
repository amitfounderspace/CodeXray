"use client";

import { useEffect, useRef, useState } from "react";
import type { Block, BlockStatus, ProjectMap } from "./schema";

// Status shown by SHADE (not hue) so the diagram stays strictly black & white.
const STATUS_FILL: Record<BlockStatus, string> = {
  ok: "#ffffff", // solid white = healthy
  risk: "#9e9e9e", // mid grey    = at risk
  down: "#3a3a3a", // dark grey   = broken
};
const STATUS_TEXT: Record<BlockStatus, string> = {
  ok: "#000000",
  risk: "#000000",
  down: "#ffffff",
};

// Map a block to its universal flowchart shape (Mermaid delimiters).
//   [( )] cylinder     → data store / cache / database
//   {{ }} hexagon      → external system / third-party service
//   [/ /] parallelogram→ I/O boundary (API route / endpoint)
//   ([ ]) stadium      → user-facing screen / terminal
//   [[ ]] subroutine   → shared module / contract / config
//   [  ]  rectangle    → process / service (default)
function shapeFor(b: Block): { open: string; close: string } {
  const text = `${b.kind} ${b.role}`.toLowerCase();
  const meta = `${b.file} ${b.kind}`.toLowerCase();

  const isStorage =
    /cache|\bstore\b|memory|database|\bdb\b|json rows|yaml|rows/.test(text);
  const isExternal =
    /external|third.?party|api$/.test(text) || /external/.test(meta);
  const isEndpoint =
    /fastapi|express|route|endpoint|\bws\b|\bpost\b|\bget\b|server/.test(text);
  const isContract =
    /contract|schema|settings|\.env|definitions|types/.test(text);
  const isUI = b.col === 0;

  if (isStorage) return { open: "[(", close: ")]" };
  if (isExternal) return { open: "{{", close: "}}" };
  if (isEndpoint) return { open: "[/", close: "/]" };
  if (isUI) return { open: "([", close: "])" };
  if (isContract) return { open: "[[", close: "]]" };
  return { open: "[", close: "]" };
}

// Insert real line breaks so Mermaid measures the WRAPPED label and sizes each
// box to fit — prevents text spilling outside the shape. Breaks after natural
// separators (space, - _ / .) once a line gets long enough.
function wrapLabel(s: string, max = 15): string {
  const breakers = new Set([" ", "-", "_", "/", "."]);
  const lines: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    cur += s[i];
    if (cur.length >= max && breakers.has(s[i])) {
      lines.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.join("<br/>");
}

// Turn the project's blocks/columns/flow into one Mermaid flowchart.
function buildGraph(project: ProjectMap): string {
  const { blocks, columns, flow } = project;
  const clean = (s: string) => s.replace(/"/g, "'");
  // Top-to-bottom flow, grouped into horizontal layer bands (Browser UI →
  // Client → Backend → Data). Flow reads downward through the bands; each band
  // lays its files out left-to-right so the grouping stays compact.
  const lines: string[] = ["flowchart TB"];

  // One subgraph per architectural layer, stacked top-to-bottom as bands.
  columns.forEach((col, ci) => {
    lines.push(`  subgraph col${ci}["${clean(col.title)}"]`);
    lines.push("    direction LR");
    blocks
      .filter((b) => b.col === ci)
      .forEach((b) => {
        const s = shapeFor(b);
        lines.push(
          `    ${b.id}${s.open}"${wrapLabel(clean(b.label))}"${s.close}`
        );
      });
    lines.push("  end");
  });

  // Force the layer bands to stack top-to-bottom in order with invisible
  // cluster-to-cluster links. This keeps each band as a clean horizontal strip
  // instead of letting flow edges scatter and overlap the boxes.
  for (let ci = 0; ci < columns.length - 1; ci++) {
    lines.push(`  col${ci} ~~~ col${ci + 1}`);
  }

  // Runtime flow (numbered, labelled, thick) — the primary story spine.
  const ordered = [...flow].sort((a, b) => a.step - b.step);
  const flowPairs = new Set<string>();
  ordered.forEach((e) => {
    flowPairs.add(`${e.from}->${e.to}`);
    flowPairs.add(`${e.to}->${e.from}`);
  });

  // Structural dependencies (thin dotted) — only where they add NEW info,
  // i.e. not already drawn as a flow edge between the same pair. Keeps the
  // picture from turning into a double-line tangle.
  blocks.forEach((b) =>
    b.deps.forEach((d) => {
      if (flowPairs.has(`${b.id}->${d}`)) return;
      lines.push(`  ${b.id} -.-> ${d}`);
    })
  );

  ordered.forEach((e) =>
    lines.push(`  ${e.from} ==>|"${e.step} · ${clean(e.label)}"| ${e.to}`)
  );

  // Monochrome per-node styling.
  blocks.forEach((b) =>
    lines.push(
      `  style ${b.id} fill:${STATUS_FILL[b.status]},stroke:#ffffff,` +
        `stroke-width:2px,color:${STATUS_TEXT[b.status]}`
    )
  );

  return lines.join("\n");
}

export default function MermaidView({ project }: { project: ProjectMap }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [svgHtml, setSvgHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Cursor-following magnifier ("loupe") state.
  const ZOOM = 2.4;
  const LW = 520;
  const LH = 260;
  const [lens, setLens] = useState<{
    show: boolean;
    x: number;
    y: number;
    tx: number;
    ty: number;
    w: number;
    h: number;
  }>({ show: false, x: 0, y: 0, tx: 0, ty: 0, w: 0, h: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        securityLevel: "strict",
        themeVariables: {
          background: "#000000",
          primaryColor: "#000000",
          primaryTextColor: "#ffffff",
          primaryBorderColor: "#ffffff",
          lineColor: "#ffffff",
          secondaryColor: "#111111",
          tertiaryColor: "#000000",
          clusterBkg: "#000000",
          clusterBorder: "#ffffff",
          edgeLabelBackground: "#000000",
          titleColor: "#ffffff",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: "23px",
        },
        flowchart: {
          curve: "basis",
          nodeSpacing: 55,
          rankSpacing: 100,
          padding: 30,
          useMaxWidth: true,
          htmlLabels: true,
          wrappingWidth: 240,
        },
      });
      try {
        const { svg } = await mermaid.render(
          "codexray-mermaid",
          buildGraph(project)
        );
        if (!cancelled) setSvgHtml(svg);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project]);

  // Track the cursor over the diagram and position the magnifier so the point
  // under the cursor sits at the centre of the loupe, scaled up by ZOOM.
  const onMove = (e: React.MouseEvent) => {
    const svg = hostRef.current?.querySelector("svg");
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    if (cx < 0 || cy < 0 || cx > r.width || cy > r.height) {
      setLens((l) => (l.show ? { ...l, show: false } : l));
      return;
    }
    setLens({
      show: true,
      x: e.clientX,
      y: e.clientY,
      tx: LW / 2 - cx * ZOOM,
      ty: LH / 2 - cy * ZOOM,
      w: r.width,
      h: r.height,
    });
  };
  const onLeave = () => setLens((l) => ({ ...l, show: false }));

  if (error)
    return (
      <div className="muted" style={{ padding: 24 }}>
        Diagram error: {error}
      </div>
    );

  // Keep the loupe fully on-screen: flip it to the other side of the cursor
  // near the right/bottom edges.
  let lx = lens.x + 28;
  let ly = lens.y + 28;
  if (typeof window !== "undefined") {
    if (lx + LW + 12 > window.innerWidth) lx = lens.x - LW - 28;
    if (ly + LH + 12 > window.innerHeight) ly = lens.y - LH - 28;
    lx = Math.max(8, lx);
    ly = Math.max(8, ly);
  }

  return (
    <div className="mermaid-wrap" onMouseMove={onMove} onMouseLeave={onLeave}>
      <div
        className="mermaid-view"
        ref={hostRef}
        aria-label="Mermaid diagram"
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />

      {lens.show && svgHtml && (
        <div
          className="mermaid-lens"
          style={{ left: lx, top: ly, width: LW, height: LH }}
          aria-hidden
        >
          <div
            className="mermaid-view mermaid-lens-inner"
            style={{
              width: lens.w,
              height: lens.h,
              transform: `translate(${lens.tx}px, ${lens.ty}px) scale(${ZOOM})`,
            }}
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        </div>
      )}
    </div>
  );
}
