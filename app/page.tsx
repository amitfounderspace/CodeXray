"use client";

// Interactive, code-accurate system map. Cards = real source files, sized by
// importance, coloured by current health. Edges are measured from the live DOM
// so they always stay glued to the cards. Two views: runtime data FLOW
// (numbered journey) and structural DEPENDENCIES (who imports whom).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Block, BlockStatus } from "./schema";
import { DEFAULT_PROJECT, PROJECTS, getProject } from "./configs";
import MermaidView from "./MermaidView";

type View = "both" | "flow" | "dep" | "mermaid";
type Heat = "calls" | "bytes";
type Rect = { x: number; y: number; w: number; h: number };

interface EdgeStat {
  count: number;
  bytes: number;
  errors: number;
  last_ts: number;
  last_ms: number;
}
interface MetricsSnap {
  now: number;
  edges: Record<string, EdgeStat>;
  routes: Record<string, EdgeStat>;
  blocks: Record<string, BlockStatus>;
}

const ENV_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

const STATUS_LABEL: Record<BlockStatus, string> = {
  ok: "Working",
  risk: "At risk",
  down: "Broken",
};

// weight (1..5) -> card width in px. Bigger = more critical.
const widthForWeight = (w: number) => 150 + w * 26;

const fmtBytes = (n: number) =>
  n <= 0
    ? "0 B"
    : n < 1024
    ? `${n} B`
    : n < 1048576
    ? `${(n / 1024).toFixed(1)} KB`
    : `${(n / 1048576).toFixed(2)} MB`;

// cool (low traffic) -> hot (busiest). Classic heat ramp.
const heatColor = (r: number) => {
  const stops: [number, [number, number, number]][] = [
    [0, [78, 161, 255]],
    [0.4, [76, 195, 138]],
    [0.7, [255, 209, 102]],
    [1, [255, 92, 82]],
  ];
  const t = Math.max(0, Math.min(1, r));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [r0, c0] = stops[i - 1];
      const [r1, c1] = stops[i];
      const k = (t - r0) / (r1 - r0 || 1);
      const ch = (a: number, b: number) => Math.round(a + (b - a) * k);
      return `rgb(${ch(c0[0], c1[0])}, ${ch(c0[1], c1[1])}, ${ch(c0[2], c1[2])})`;
    }
  }
  return "rgb(255,92,82)";
};

export default function CodeXrayPage() {
  // Which project's map to render. Resolve from ?project= (or NEXT_PUBLIC_PROJECT),
  // reconciled after mount so SSR and first client render both use the default
  // (avoids a hydration mismatch). Swap projects live by changing the URL param.
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("project");
    const id = q || process.env.NEXT_PUBLIC_PROJECT || DEFAULT_PROJECT;
    if (PROJECTS[id]) setProjectId(id);
  }, []);
  const project = getProject(projectId);
  const BLOCKS = project.blocks;
  const COLUMNS = project.columns;
  const FLOW = project.flow;
  const BACKEND_URL = project.backendUrl || ENV_BACKEND_URL;

  const innerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({ active: false, x: 0, y: 0, left: 0, top: 0 });
  const [panning, setPanning] = useState(false);
  const zoomRef = useRef(1);
  const [zoom, setZoom] = useState(1);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>("both");
  const [heat, setHeat] = useState<Heat>("calls");
  const [active, setActive] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsSnap | null>(null);
  const [online, setOnline] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);
  // Per-card drag offset (layout px). Cards keep their column slot; this just
  // nudges them visually. Edges/heat re-measure on every move so they stay glued.
  const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const dragRef = useRef<{
    id: string;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
  } | null>(null);
  // Floating card tooltip (mirrors the bottom DetailPanel) — repositioned
  // imperatively on mouse move so it follows the cursor without re-rendering.
  const tipRef = useRef<HTMLDivElement>(null);

  // Live poll — reflects any backend change within ~1s (works across tabs).
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`${BACKEND_URL}/metrics`, { cache: "no-store" });
        const j = (await r.json()) as MetricsSnap;
        if (!stop) {
          setMetrics(j);
          setOnline(true);
          setUpdatedAt(Date.now());
        }
      } catch {
        if (!stop) setOnline(false);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [BACKEND_URL]);

  // Miro-style click-and-drag panning across the board.
  const onPanStart = (e: React.MouseEvent) => {
    const el = canvasRef.current;
    if (!el) return;
    panRef.current = {
      active: true,
      x: e.pageX,
      y: e.pageY,
      left: el.scrollLeft,
      top: el.scrollTop,
    };
    setPanning(true);
  };
  const onPanMove = (e: React.MouseEvent) => {
    const p = panRef.current;
    const el = canvasRef.current;
    if (!p.active || !el) return;
    el.scrollLeft = p.left - (e.pageX - p.x);
    el.scrollTop = p.top - (e.pageY - p.y);
  };
  const onPanEnd = () => {
    if (!panRef.current.active) return;
    panRef.current.active = false;
    setPanning(false);
  };

  // Zoom out for more breathing room, zoom in for detail. Clamped 40%–140%.
  const setZoomLevel = (z: number) => {
    const clamped = Math.min(1.4, Math.max(0.4, Math.round(z * 20) / 20));
    zoomRef.current = clamped;
    setZoom(clamped);
  };

  const measure = useCallback(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const z = zoomRef.current || 1;
    const base = inner.getBoundingClientRect();
    const next: Record<string, Rect> = {};
    for (const b of BLOCKS) {
      const el = nodeRefs.current[b.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      // Divide by zoom so edge/heat coords stay in unscaled layout space,
      // then the whole inner (incl. those SVGs) is scaled together by CSS.
      next[b.id] = {
        x: (r.left - base.left) / z,
        y: (r.top - base.top) / z,
        w: r.width / z,
        h: r.height / z,
      };
    }
    setRects(next);
    setSize({ w: inner.scrollWidth, h: inner.scrollHeight });
  }, [BLOCKS]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (innerRef.current) ro.observe(innerRef.current);
    window.addEventListener("resize", measure);
    const t = setTimeout(measure, 250); // re-measure after fonts settle
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      clearTimeout(t);
    };
  }, [measure]);

  // Re-measure after a zoom change repaints so edges snap back onto the cards.
  useLayoutEffect(() => {
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [zoom, measure]);

  // Card dragging. Moving a card only shifts it via a CSS transform, so its
  // getBoundingClientRect changes and measure() re-snaps every edge/heat blob
  // to the new position — the arrows stay glued to the card as it moves.
  const onNodeDragMove = useCallback(
    (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const z = zoomRef.current || 1;
      const dx = (e.pageX - d.sx) / z;
      const dy = (e.pageY - d.sy) / z;
      setOffsets((o) => ({ ...o, [d.id]: { x: d.ox + dx, y: d.oy + dy } }));
      requestAnimationFrame(measure);
    },
    [measure]
  );
  const onNodeDragEnd = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("mousemove", onNodeDragMove);
    window.removeEventListener("mouseup", onNodeDragEnd);
    setPanning(false);
    requestAnimationFrame(measure);
  }, [measure, onNodeDragMove]);
  const onNodeDragStart = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation(); // don't start a board pan
      e.preventDefault(); // don't select text
      const cur = offsets[id] ?? { x: 0, y: 0 };
      dragRef.current = { id, sx: e.pageX, sy: e.pageY, ox: cur.x, oy: cur.y };
      setPanning(true); // reuse grabbing cursor
      window.addEventListener("mousemove", onNodeDragMove);
      window.addEventListener("mouseup", onNodeDragEnd);
    },
    [offsets, onNodeDragMove, onNodeDragEnd]
  );

  // Keep the floating tooltip pinned near the cursor. Positioned imperatively
  // (no React re-render on move) and flipped so it never runs off-screen.
  const onInnerMove = useCallback((e: React.MouseEvent) => {
    const el = tipRef.current;
    if (!el) return;
    const pad = 14;
    const r = el.getBoundingClientRect();
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    if (x + r.width + pad > window.innerWidth) x = e.clientX - r.width - pad;
    if (y + r.height + pad > window.innerHeight) y = e.clientY - r.height - pad;
    el.style.left = `${Math.max(8, x)}px`;
    el.style.top = `${Math.max(8, y)}px`;
  }, []);

  const depEdges =
    view !== "flow"
      ? BLOCKS.flatMap((b) => b.deps.map((d) => ({ from: b.id, to: d })))
      : [];
  const flowEdges = view !== "dep" ? FLOW : [];

  const connected = new Set<string>();
  if (active) {
    connected.add(active);
    for (const e of depEdges)
      if (e.from === active || e.to === active) {
        connected.add(e.from);
        connected.add(e.to);
      }
    for (const e of flowEdges)
      if (e.from === active || e.to === active) {
        connected.add(e.from);
        connected.add(e.to);
      }
  }

  const path = (a: Rect, b: Rect) => {
    const ay = a.y + a.h / 2;
    const by = b.y + b.h / 2;
    let sx: number;
    let tx: number;
    const acx = a.x + a.w / 2;
    const bcx = b.x + b.w / 2;
    if (bcx > acx + 8) {
      sx = a.x + a.w;
      tx = b.x;
    } else if (bcx < acx - 8) {
      sx = a.x;
      tx = b.x + b.w;
    } else {
      sx = a.x + a.w; // same column: bow out to the right
      tx = b.x + b.w;
    }
    const dx = Math.max(36, Math.abs(tx - sx) * 0.45);
    const c1 = sx + (tx >= sx ? dx : -dx);
    const c2 = tx + (tx >= sx ? -dx : dx);
    return {
      d: `M ${sx} ${ay} C ${c1} ${ay}, ${c2} ${by}, ${tx} ${by}`,
      mid: { x: (sx + tx) / 2, y: (ay + by) / 2 },
    };
  };

  const activeBlock = active ? BLOCKS.find((b) => b.id === active) : null;

  // Live status overrides the static guess in blocks.ts.
  const liveStatus = (b: Block): BlockStatus =>
    metrics?.blocks?.[b.id] ?? b.status;

  // Heat normalization across all measured edges.
  const edgeStats = metrics?.edges ?? {};
  const basisVal = (s: EdgeStat) => (heat === "calls" ? s.count : s.bytes);
  const maxVal = Math.max(
    1,
    ...Object.values(edgeStats).map(basisVal)
  );
  const statFor = (from: string, to: string): EdgeStat | undefined =>
    edgeStats[`${from}->${to}`];
  const isHot = (s: EdgeStat) =>
    metrics ? metrics.now - s.last_ts < 3 : false;

  // Per-node load = total traffic on every flow edge that touches it. Drives
  // the WiFi-style background heat field (cool blue idle → red busiest).
  const nodeHeat: Record<string, number> = {};
  for (const e of FLOW) {
    const s = statFor(e.from, e.to);
    if (!s) continue;
    const v = basisVal(s);
    nodeHeat[e.from] = (nodeHeat[e.from] ?? 0) + v;
    nodeHeat[e.to] = (nodeHeat[e.to] ?? 0) + v;
  }
  const maxNodeHeat = Math.max(1, ...Object.values(nodeHeat));

  const secsAgo = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt) / 1000)) : 0;


  return (
    <main className="container arch-wide">
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="arch-head">
          <div>
            <h2 style={{ margin: 0 }}>CodeXray · {project.name}</h2>
            <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
              Each card is a real source file.{" "}
              <strong>Bigger = more important.</strong> Colour = live health,
              arrows = live traffic. Hover any card for details.
            </p>
          </div>
          <div className="arch-head-right">
            <span className={`live-tag ${online ? "on" : "off"}`}>
              <i className="live-dot" />
              {online ? `LIVE · updated ${secsAgo}s ago` : "Not connected"}
            </span>
            <div className="arch-toggle" role="tablist" aria-label="diagram view">
              <button
                className={view === "both" ? "on" : ""}
                onClick={() => setView("both")}
              >
                Both
              </button>
              <button
                className={view === "flow" ? "on" : ""}
                onClick={() => setView("flow")}
              >
                Data flow
              </button>
              <button
                className={view === "dep" ? "on" : ""}
                onClick={() => setView("dep")}
              >
                Dependencies
              </button>
              <button
                className={view === "mermaid" ? "on" : ""}
                onClick={() => setView("mermaid")}
              >
                Mermaid
              </button>
            </div>
          </div>
        </div>

        <div className="arch-legend">
          <span>
            <i className="dot ok" /> Working
          </span>
          <span>
            <i className="dot risk" /> At risk
          </span>
          <span>
            <i className="dot down" /> Broken now
          </span>
          <span className="sep" />
          <span className="heat-ramp" /> <span className="muted">cool → busiest</span>
          <span>
            <i className="edge-key dep" /> Depends on (imports)
          </span>
          <span className="sep" />
          <span className="muted">Heat by</span>
          <div className="arch-toggle small">
            <button
              className={heat === "calls" ? "on" : ""}
              onClick={() => setHeat("calls")}
            >
              Calls
            </button>
            <button
              className={heat === "bytes" ? "on" : ""}
              onClick={() => setHeat("bytes")}
            >
              Data
            </button>
          </div>
        </div>
      </div>

      {!online && (
        <div className="connect-banner panel">
          <div className="connect-banner-icon" aria-hidden>
            🔌
          </div>
          <div className="connect-banner-body">
            <h3>Connect your repo to go live</h3>
            <p>
              The map below already shows your code&rsquo;s structure. To light it
              up with real&#8209;time traffic and health, start your app&rsquo;s
              backend so CodeXray can read its live data from{" "}
              <code>{BACKEND_URL}/metrics</code>.
            </p>
            <p className="connect-banner-hint">
              Not sure how? Ask your AI assistant to{" "}
              <em>&ldquo;set up CodeXray for my project&rdquo;</em> — it follows the
              built&#8209;in instructions and wires everything up for you.
            </p>
          </div>
        </div>
      )}

      {view === "mermaid" ? (
        <div className="panel mermaid-panel">
          <MermaidView project={project} />
        </div>
      ) : (
      <div className="arch-stage-wrap">
        <div
          className={`arch-canvas${panning ? " panning" : ""}`}
          ref={canvasRef}
          onMouseDown={onPanStart}
          onMouseMove={onPanMove}
          onMouseUp={onPanEnd}
          onMouseLeave={onPanEnd}
        >
          <div
            className="arch-stage"
            style={{
              width: size.w ? size.w * zoom : undefined,
              height: size.h ? size.h * zoom : undefined,
            }}
          >
            <div
              className="arch-inner"
              ref={innerRef}
              onMouseMove={onInnerMove}
              style={{ transform: `scale(${zoom})`, transformOrigin: "0 0" }}
            >
          <svg
            className="arch-heatfield"
            width={size.w}
            height={size.h}
            style={{ opacity: Object.keys(rects).length ? 1 : 0 }}
            aria-hidden
          >
            <defs>
              <filter
                id="heat-blur"
                x="-30%"
                y="-30%"
                width="160%"
                height="160%"
              >
                <feGaussianBlur stdDeviation="38" />
              </filter>
              {BLOCKS.map((b) => {
                const r = rects[b.id];
                if (!r) return null;
                const ratio = (nodeHeat[b.id] ?? 0) / maxNodeHeat;
                const col = heatColor(ratio);
                return (
                  <radialGradient
                    key={`hg-${b.id}`}
                    id={`heat-${b.id}`}
                    cx="50%"
                    cy="50%"
                    r="50%"
                  >
                    <stop offset="0%" stopColor={col} stopOpacity={0.9} />
                    <stop offset="55%" stopColor={col} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={col} stopOpacity={0} />
                  </radialGradient>
                );
              })}
            </defs>
            <g filter="url(#heat-blur)">
              {BLOCKS.map((b) => {
                const r = rects[b.id];
                if (!r) return null;
                const ratio = (nodeHeat[b.id] ?? 0) / maxNodeHeat;
                const rad = 112 + ratio * 128;
                return (
                  <circle
                    key={`hc-${b.id}`}
                    cx={r.x + r.w / 2}
                    cy={r.y + r.h / 2}
                    r={rad}
                    fill={`url(#heat-${b.id})`}
                  />
                );
              })}
            </g>
          </svg>
          <svg
            className="arch-edges"
            width={size.w}
            height={size.h}
            style={{ opacity: Object.keys(rects).length ? 1 : 0 }}
          >
            <defs>
              <marker
                id="arrow-flow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerUnits="userSpaceOnUse"
                markerWidth="6.5"
                markerHeight="6.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#6ea8fe" />
              </marker>
              <marker
                id="arrow-dep"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerUnits="userSpaceOnUse"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7794" />
              </marker>
            </defs>

            {depEdges.map((e, i) => {
              const a = rects[e.from];
              const b = rects[e.to];
              if (!a || !b) return null;
              const p = path(a, b);
              const dim =
                active && !(connected.has(e.from) && connected.has(e.to));
              const fromLbl =
                BLOCKS.find((x) => x.id === e.from)?.label ?? e.from;
              const toLbl = BLOCKS.find((x) => x.id === e.to)?.label ?? e.to;
              return (
                <g key={`dep-${i}`} style={{ opacity: dim ? 0.08 : 0.5 }}>
                  <title>{`${fromLbl} depends on ${toLbl} — dashed grey = a code dependency (imports it), not live traffic`}</title>
                  <path
                    d={p.d}
                    className="edge dep"
                    markerEnd="url(#arrow-dep)"
                  />
                  <path d={p.d} className="edge-hit" />
                </g>
              );
            })}

            {flowEdges.map((e) => {
              const a = rects[e.from];
              const b = rects[e.to];
              if (!a || !b) return null;
              const p = path(a, b);
              const dim =
                active && !(connected.has(e.from) && connected.has(e.to));
              const stat = statFor(e.from, e.to);
              const ratio = stat ? basisVal(stat) / maxVal : 0;
              const color = stat
                ? stat.errors > 0
                  ? "#ff5c52"
                  : heatColor(ratio)
                : "#3a445f";
              const hot = stat ? isHot(stat) : false;
              const label = stat
                ? heat === "calls"
                  ? `${basisVal(stat)}×`
                  : fmtBytes(stat.bytes)
                : "";
              // Traffic volume is carried by the NUMBER, not the line: the
              // busier the path, the bigger (and warmer) the number grows.
              const labelSize = 11 + ratio * 9;
              const fromLbl =
                BLOCKS.find((x) => x.id === e.from)?.label ?? e.from;
              const toLbl = BLOCKS.find((x) => x.id === e.to)?.label ?? e.to;
              const tip = stat
                ? `Step ${e.step}: ${fromLbl} → ${toLbl}\n` +
                  `Number = ${
                    heat === "calls"
                      ? `${stat.count} call${stat.count === 1 ? "" : "s"}`
                      : fmtBytes(stat.bytes)
                  } — how busy this path is (bigger = more traffic)\n` +
                  `Colour = traffic level: blue idle → green → amber → red busiest` +
                  (stat.errors > 0
                    ? `\n⚠ ${stat.errors} error${
                        stat.errors === 1 ? "" : "s"
                      } on this path`
                    : "")
                : `Step ${e.step}: ${fromLbl} → ${toLbl}\nNo traffic yet — grey = idle. Run a story to light it up.`;
              return (
                <g key={`flow-${e.step}`} style={{ opacity: dim ? 0.08 : 1 }}>
                  <title>{tip}</title>
                  <path
                    d={p.d}
                    className={`edge flow ${hot ? "hot" : ""} ${
                      stat ? "" : "idle"
                    }`}
                    markerEnd="url(#arrow-flow)"
                    style={{ stroke: color, strokeWidth: 2.6 }}
                  />
                  <path d={p.d} className="edge-hit" />
                  <circle
                    cx={p.mid.x}
                    cy={p.mid.y}
                    r={10}
                    className="step-badge"
                    style={{ stroke: color }}
                  />
                  <text x={p.mid.x} y={p.mid.y + 3.5} className="step-num">
                    {e.step}
                  </text>
                  {label && (
                    <text
                      x={p.mid.x}
                      y={p.mid.y - 15}
                      className="edge-label"
                      style={{ fill: color, fontSize: labelSize }}
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {COLUMNS.map((col, ci) => (
            <div className="arch-col" key={col.title}>
              <div className="arch-col-head">
                <h3>{col.title}</h3>
                <span className="muted">{col.subtitle}</span>
              </div>
              {BLOCKS.filter((b) => b.col === ci).map((b) => (
                <Node
                  key={b.id}
                  block={b}
                  status={liveStatus(b)}
                  refCb={(el) => (nodeRefs.current[b.id] = el)}
                  active={active === b.id}
                  dim={!!active && !connected.has(b.id)}
                  offset={offsets[b.id]}
                  onDragStart={onNodeDragStart}
                  onEnter={() => setActive(b.id)}
                  onLeave={() => setActive(null)}
                />
              ))}
            </div>
          ))}
            </div>
          </div>
        </div>
        <div className="arch-zoom">
          <button
            type="button"
            onClick={() => setZoomLevel(zoom - 0.1)}
            aria-label="Zoom out"
            title="Zoom out (more space)"
          >
            −
          </button>
          <span className="arch-zoom-val">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoomLevel(zoom + 0.1)}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="arch-zoom-reset"
            onClick={() => setZoomLevel(1)}
            title="Reset zoom"
          >
            Reset
          </button>
          <span className="arch-zoom-sep" />
          <button
            type="button"
            className="arch-zoom-reset"
            onClick={() => {
              setOffsets({});
              requestAnimationFrame(measure);
            }}
            disabled={Object.keys(offsets).length === 0}
            title="Snap all cards back to their original places"
          >
            Reset layout
          </button>
        </div>
      </div>
      )}

      <div className="arch-bottom">
        <DetailPanel block={activeBlock ?? null} status={activeBlock ? liveStatus(activeBlock) : "ok"} blocks={BLOCKS} />
        <BusiestRoutes routes={metrics?.routes ?? {}} heat={heat} />
      </div>

      {/* Floating card tooltip — same detail as the bottom panel, right at the
          cursor. Hidden while dragging so it never blocks the card being moved. */}
      <div
        ref={tipRef}
        className={`node-tip ${
          activeBlock && !panning ? "show" : ""
        } ${activeBlock ? liveStatus(activeBlock) : ""}`}
        aria-hidden
      >
        {activeBlock && (
          <>
            <div className="node-tip-head">
              <span className={`dot ${liveStatus(activeBlock)}`} />
              <strong>{activeBlock.label}</strong>
              <span className={`status-pill ${liveStatus(activeBlock)}`}>
                {STATUS_LABEL[liveStatus(activeBlock)]}
              </span>
            </div>
            <p className="node-file" style={{ margin: "4px 0 0" }}>
              {activeBlock.file} · {activeBlock.kind}
            </p>
            <dl className="arch-dl" style={{ marginTop: 6 }}>
              <dt>What it does</dt>
              <dd>{activeBlock.role}</dd>
              <dt>Why it matters</dt>
              <dd>{activeBlock.why}</dd>
              <dt>Status right now</dt>
              <dd>{activeBlock.statusNote}</dd>
              {activeBlock.deps.length > 0 && (
                <>
                  <dt>Depends on</dt>
                  <dd>
                    {activeBlock.deps
                      .map((d) => BLOCKS.find((b) => b.id === d)?.label ?? d)
                      .join(", ")}
                  </dd>
                </>
              )}
            </dl>
          </>
        )}
      </div>
    </main>
  );
}

function Node({
  block,
  status,
  refCb,
  active,
  dim,
  offset,
  onDragStart,
  onEnter,
  onLeave,
}: {
  block: Block;
  status: BlockStatus;
  refCb: (el: HTMLDivElement | null) => void;
  active: boolean;
  dim: boolean;
  offset?: { x: number; y: number };
  onDragStart: (id: string, e: React.MouseEvent) => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <div
      ref={refCb}
      className={`node ${status} ${active ? "active" : ""} ${
        dim ? "dim" : ""
      }`}
      style={{
        width: widthForWeight(block.weight),
        transform: offset ? `translate(${offset.x}px, ${offset.y}px)` : undefined,
      }}
      onMouseDown={(e) => onDragStart(block.id, e)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      tabIndex={0}
    >
      <div className="node-top">
        <span className={`dot ${status}`} />
        <span className="node-kind">{block.kind}</span>
      </div>
      <div className="node-label">{block.label}</div>
      <div className="node-file">{block.file}</div>
    </div>
  );
}

function DetailPanel({
  block,
  status,
  blocks,
}: {
  block: Block | null;
  status: BlockStatus;
  blocks: Block[];
}) {
  if (!block) {
    // Nothing hovered: render nothing. The cursor-following tooltip already
    // shows this same detail, so the empty placeholder card is redundant.
    return null;
  }
  const depNames = block.deps
    .map((d) => blocks.find((b) => b.id === d)?.label ?? d)
    .join(", ");
  return (
    <div className={`panel arch-detail ${status}`}>
      <div className="arch-detail-head">
        <span className={`dot ${status}`} />
        <h2 style={{ margin: 0 }}>{block.label}</h2>
        <span className={`status-pill ${status}`}>{STATUS_LABEL[status]}</span>
      </div>
      <p className="node-file" style={{ marginTop: 4 }}>
        {block.file} · {block.kind}
      </p>
      <dl className="arch-dl">
        <dt>What it does</dt>
        <dd>{block.role}</dd>
        <dt>Why it matters</dt>
        <dd>{block.why}</dd>
        <dt>Status right now</dt>
        <dd>{block.statusNote}</dd>
        {block.deps.length > 0 && (
          <>
            <dt>Depends on</dt>
            <dd>{depNames}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function BusiestRoutes({
  routes,
  heat,
}: {
  routes: Record<string, EdgeStat>;
  heat: Heat;
}) {
  const rows = Object.entries(routes).sort((a, b) =>
    heat === "calls" ? b[1].count - a[1].count : b[1].bytes - a[1].bytes
  );
  const max = Math.max(
    1,
    ...rows.map(([, s]) => (heat === "calls" ? s.count : s.bytes))
  );
  return (
    <div className="panel arch-routes">
      <h2>Busiest routes — by {heat === "calls" ? "calls" : "data"}</h2>
      {rows.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No traffic yet. Start a story on the{" "}
          <a href="/">debug console</a> and watch this fill up live.
        </p>
      ) : (
        <ul className="route-list">
          {rows.map(([name, s]) => {
            const v = heat === "calls" ? s.count : s.bytes;
            const pct = (v / max) * 100;
            return (
              <li key={name} className={s.errors > 0 ? "err" : ""}>
                <div className="route-row">
                  <span className="route-name">{name}</span>
                  <span className="route-val">
                    {s.count}× · {fmtBytes(s.bytes)}
                    {s.last_ms ? ` · ${s.last_ms}ms` : ""}
                    {s.errors > 0 ? ` · ${s.errors} err` : ""}
                  </span>
                </div>
                <div className="route-bar">
                  <span
                    style={{
                      width: `${pct}%`,
                      background:
                        s.errors > 0 ? "var(--color-error)" : "var(--accent)",
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
