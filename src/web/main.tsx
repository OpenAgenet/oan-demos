// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, Boxes, ChevronDown, ChevronRight, Network, Play, ShieldCheck, Zap } from "lucide-react";
import type { DemoArtifact, DemoEvent, DemoNode, DemoResource, DemoScenarioId, DemoSnapshot } from "../shared/types.js";
import oanLogoUrl from "./assets/oan-logo.png";
import brand from "./assets/slogan.json";
import "./styles.css";

const scenarioLabels: Record<DemoScenarioId, string> = {
  "service-agent": "Service Agent",
  "mixed-four": "Four Resources",
  "mixed-1000": "1000 Mixed",
};

type SelectedDetail =
  | { kind: "resource"; resource: DemoResource }
  | { kind: "artifact"; artifact: DemoArtifact };

const initialSnapshot: DemoSnapshot = {
  running: false,
  nodes: defaultTopologyNodes(),
  resources: [],
  artifacts: [],
  events: [],
  stats: {},
};

function App() {
  const [snapshot, setSnapshot] = useState<DemoSnapshot>(initialSnapshot);
  const [selectedDetail, setSelectedDetail] = useState<SelectedDetail | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<DemoScenarioId>("service-agent");
  const [openDrawer, setOpenDrawer] = useState<"resources" | "artifacts" | "details" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const userSelectedScenario = useRef(false);

  useEffect(() => {
    refreshSnapshot(setSnapshot, (incoming) => {
      if (!userSelectedScenario.current && incoming.activeScenario) setSelectedScenario(incoming.activeScenario);
    });
    const source = new EventSource("/events");
    source.addEventListener("snapshot", (event) => {
      const incoming = JSON.parse((event as MessageEvent).data) as DemoSnapshot;
      if (!userSelectedScenario.current && incoming.activeScenario) setSelectedScenario(incoming.activeScenario);
      setSnapshot((current) => mergeServerSnapshot(current, incoming));
    });
    source.addEventListener("demo", (event) => {
      const demoEvent = JSON.parse((event as MessageEvent).data) as DemoEvent;
      setSnapshot((current) => reduceEvent(current, demoEvent));
    });
    return () => source.close();
  }, []);

  useEffect(() => {
    if (!snapshot.running) return undefined;
    const timer = window.setInterval(() => refreshSnapshot(setSnapshot), 1500);
    return () => window.clearInterval(timer);
  }, [snapshot.running]);

  useEffect(() => {
    if (!userSelectedScenario.current && snapshot.activeScenario) {
      setSelectedScenario(snapshot.activeScenario);
    }
  }, [snapshot.activeScenario]);

  const displaySnapshot = useMemo(() => resetSnapshotForScenario(snapshot, selectedScenario), [snapshot, selectedScenario]);
  const graph = useMemo(() => buildGraph(displaySnapshot), [displaySnapshot]);
  const displayArtifacts = displaySnapshot.artifacts;

  async function runScenario() {
    if (snapshot.running) {
      notifyRunning();
      return;
    }
    const optimisticEvent: DemoEvent = {
      id: Date.now(),
      at: new Date().toISOString(),
      kind: "scenario-started",
      scenarioId: selectedScenario,
      title: `Starting ${scenarioLabels[selectedScenario]}`,
      message: "Launching local OAN topology",
    };
    setSnapshot((current) => ({
      ...resetSnapshotForScenario(current, selectedScenario, true),
      running: true,
      activeScenario: selectedScenario,
      events: [optimisticEvent],
    }));
    const response = await fetch("/api/scenarios/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioId: selectedScenario }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const failedEvent: DemoEvent = {
        id: Date.now() + 1,
        at: new Date().toISOString(),
        kind: "scenario-failed",
        scenarioId: selectedScenario,
        title: response.status === 409 ? "Another scenario is already running" : "Run request failed",
        message: body.error ?? response.statusText,
      };
      setSnapshot((current) => ({
        ...current,
        running: false,
        events: [...current.events, failedEvent].slice(-500),
      }));
      return;
    }
    window.setTimeout(() => refreshSnapshot(setSnapshot), 700);
  }

  function changeScenario(nextScenario: DemoScenarioId) {
    if (snapshot.running) {
      notifyRunning();
      return;
    }
    userSelectedScenario.current = true;
    setSelectedScenario(nextScenario);
    setSelectedDetail(null);
    setOpenDrawer(null);
  }

  function notifyRunning() {
    setToast("Running, Wait");
    window.setTimeout(() => setToast(null), 1600);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img src={oanLogoUrl} alt={`${brand.abbreviation} logo`} />
          <div>
            <strong>{brand.abbreviation}</strong>
            <h1>{brand.productName}</h1>
            <p>{brand.slogan}</p>
          </div>
        </div>
        <div className="run-controls">
          <select
            value={selectedScenario}
            onMouseDown={(event) => {
              if (snapshot.running) {
                event.preventDefault();
                notifyRunning();
              }
            }}
            onKeyDown={(event) => {
              if (snapshot.running) {
                event.preventDefault();
                notifyRunning();
              }
            }}
            onChange={(event) => changeScenario(event.target.value as DemoScenarioId)}
            aria-disabled={snapshot.running}
          >
            {Object.entries(scenarioLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <button onClick={runScenario} aria-disabled={snapshot.running}>
            <Play size={16} />
            Run
          </button>
        </div>
      </header>
      {toast ? <div className="toast">{toast}</div> : null}

      <section className="metrics-strip">
        <Metric icon={<Network />} label="Nodes" value={snapshot.nodes.length} />
        <Metric icon={<Boxes />} label="Resources" value={displaySnapshot.resources.length} />
        <Metric icon={<ShieldCheck />} label="Artifacts" value={displaySnapshot.artifacts.length} />
        <Metric icon={<Activity />} label="Events" value={displaySnapshot.events.length} />
        <Metric icon={<Zap />} label="Accepted" value={String(displaySnapshot.stats.accepted ?? displaySnapshot.stats.rootLatest ?? "-")} />
        <FlowBanner snapshot={displaySnapshot} />
      </section>

      <section className="workspace">
        <div className={`topology-panel ${displaySnapshot.running ? "is-running" : ""}`}>
          <TopologyGraph graph={graph} />
        </div>

        <aside className="side-panel">
          <h2>Timeline</h2>
          <div className="timeline">
            {[...displaySnapshot.events].reverse().slice(0, 80).map((event) => (
              <div key={event.id} className={`event event-${event.kind}`}>
                <time>{new Date(event.at).toLocaleTimeString()}</time>
                <strong>{event.title}</strong>
                {event.message ? <span>{event.message}</span> : null}
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className={`inspector-drawer ${openDrawer ? "is-open" : ""}`}>
        <div className="drawer-tabs">
          <DrawerTab id="resources" openDrawer={openDrawer} setOpenDrawer={setOpenDrawer} label="Resources" count={displaySnapshot.resources.length} />
          <DrawerTab id="artifacts" openDrawer={openDrawer} setOpenDrawer={setOpenDrawer} label="Artifacts" count={displaySnapshot.artifacts.length} />
          <DrawerTab id="details" openDrawer={openDrawer} setOpenDrawer={setOpenDrawer} label="Details" count={selectedDetail ? 1 : 0} />
        </div>

        {openDrawer ? (
          <div className="drawer-content">
            {openDrawer === "resources" ? (
              <div className="resource-panel">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Stage</th>
                      <th>DID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displaySnapshot.resources.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="empty-cell">
                          {displaySnapshot.activeScenario === "mixed-1000"
                            ? "1000 Mixed shows aggregate pressure counters only; individual resource rows are intentionally not retained."
                            : "No resources captured for this scenario yet."}
                        </td>
                      </tr>
                    ) : displaySnapshot.resources.map((resource) => (
                      <tr
                        key={resource.did}
                        className={selectedDetail?.kind === "resource" && selectedDetail.resource.did === resource.did ? "active-row" : ""}
                        onClick={() => {
                          setSelectedDetail({ kind: "resource", resource });
                          setOpenDrawer("details");
                        }}
                      >
                        <td><button className="link-button">{resource.name}</button></td>
                        <td>{resource.type}</td>
                        <td><span className={`stage stage-${resource.stage}`}>{resource.stage}</span></td>
                        <td className="did-cell">{resource.did}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {openDrawer === "artifacts" ? (
              <div className="artifact-panel">
                <div className="artifact-list">
                  {displayArtifacts.length === 0 ? <p className="empty-panel">No artifacts captured for this view.</p> : null}
                  {displayArtifacts.map((artifact) => (
                    <button
                      key={artifact.id}
                      onClick={() => {
                        setSelectedDetail({ kind: "artifact", artifact });
                        setOpenDrawer("details");
                      }}
                      className={selectedDetail?.kind === "artifact" && selectedDetail.artifact.id === artifact.id ? "active" : ""}
                    >
                      <span>{artifact.title}</span>
                      <small>{artifact.kind}{artifact.sensitive ? " / sensitive" : ""}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {openDrawer === "details" ? (
              <div className="detail-panel">
                {selectedDetail ? <DetailHeader selectedDetail={selectedDetail} /> : null}
                <pre>{selectedDetail ? JSON.stringify(detailValue(selectedDetail), null, 2) : "Open Resources or Artifacts and select one item to inspect its details."}</pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function DrawerTab({
  id,
  label,
  count,
  openDrawer,
  setOpenDrawer,
}: {
  id: "resources" | "artifacts" | "details";
  label: string;
  count: number;
  openDrawer: "resources" | "artifacts" | "details" | null;
  setOpenDrawer: React.Dispatch<React.SetStateAction<"resources" | "artifacts" | "details" | null>>;
}) {
  const active = openDrawer === id;
  return (
    <button className={active ? "active" : ""} onClick={() => setOpenDrawer(active ? null : id)}>
      {active ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      <span>{label}</span>
      <strong>{count}</strong>
    </button>
  );
}

function DetailHeader({ selectedDetail }: { selectedDetail: SelectedDetail }) {
  if (selectedDetail.kind === "resource") {
    return (
      <div className="detail-header">
        <span>Resource</span>
        <strong>{selectedDetail.resource.name}</strong>
        <small>{selectedDetail.resource.did}</small>
      </div>
    );
  }
  return (
    <div className="detail-header">
      <span>Artifact</span>
      <strong>{selectedDetail.artifact.title}</strong>
      <small>{selectedDetail.artifact.kind}{selectedDetail.artifact.resourceDid ? ` / ${selectedDetail.artifact.resourceDid}` : ""}</small>
    </div>
  );
}

function detailValue(selectedDetail: SelectedDetail): unknown {
  if (selectedDetail.kind === "resource") return selectedDetail.resource;
  return selectedDetail.artifact.value;
}

interface GraphNodeView {
  id: string;
  x: number;
  y: number;
  node: DemoNode;
  active: boolean;
  resourceText?: string;
}

interface GraphEdgeView {
  id: string;
  source: string;
  target: string;
  sourcePort: "left" | "right" | "top" | "bottom";
  targetPort: "left" | "right" | "top" | "bottom";
  label?: string;
  active: boolean;
  done: boolean;
  curved?: boolean;
  trust?: boolean;
}

function TopologyGraph({ graph }: { graph: { nodes: GraphNodeView[]; edges: GraphEdgeView[] } }) {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  return (
    <svg className="topology-svg" viewBox="0 0 1250 570" role="img" aria-label="OAN demo topology">
      <defs>
        <marker id="arrow-default" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 5 2.5 L 0 5 z" />
        </marker>
        <marker id="arrow-active" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 5 2.5 L 0 5 z" />
        </marker>
        <marker id="arrow-done" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 5 2.5 L 0 5 z" />
        </marker>
      </defs>
      <g className="topology-edges">
        {graph.edges.map((edge) => {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          if (!source || !target) return null;
          const path = edgePath(source, target, edge);
          const labelPoint = edgeLabelPoint(source, target, edge);
          return (
            <g key={edge.id} className={`topology-edge ${edge.active ? "edge-active" : ""} ${edge.done ? "edge-done" : ""} ${edge.trust ? "edge-trust" : ""}`} data-edge-id={edge.id}>
              <title>{edge.id}</title>
              <path d={path} markerEnd={edge.trust && !edge.active && !edge.done ? undefined : `url(#${edge.active ? "arrow-active" : edge.done ? "arrow-done" : "arrow-default"})`} />
              {edge.label ? (
                <text x={labelPoint.x} y={labelPoint.y}>
                  {edge.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
      <g className="topology-nodes">
        {graph.nodes.map((item) => (
          <foreignObject key={item.id} x={item.x} y={item.y} width="180" height="124" className="topology-node">
            <div className={`graph-node graph-${item.node.kind} status-${item.node.status ?? "idle"} ${item.active ? "status-active" : ""}`}>
              <strong>
                {item.node.label}
                {item.active ? <i /> : null}
              </strong>
              <span>{item.node.did ? shortDid(item.node.did) : item.node.endpoint ?? item.node.kind}</span>
              {item.node.domains?.length ? <small>{item.node.domains.join(", ")}</small> : null}
              {item.resourceText ? <em>{item.resourceText}</em> : null}
            </div>
          </foreignObject>
        ))}
      </g>
      <g className="topology-handles">
        {graph.edges.flatMap((edge) => {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          if (!source || !target) return [];
          const a = portPoint(source, edge.sourcePort);
          const b = portPoint(target, edge.targetPort);
          return [
            <circle key={`${edge.id}:s`} cx={a.x} cy={a.y} r="4" />,
            <circle key={`${edge.id}:t`} cx={b.x} cy={b.y} r="4" />,
          ];
        })}
      </g>
    </svg>
  );
}

function edgePath(source: GraphNodeView, target: GraphNodeView, edge: GraphEdgeView): string {
  const a = portPoint(source, edge.sourcePort);
  const b = portPoint(target, edge.targetPort);
  if (edge.curved) {
    const c1 = { x: a.x + 180, y: a.y + 92 };
    const c2 = { x: b.x - 180, y: b.y + 92 };
    return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
  }
  if (edge.sourcePort === "bottom" && edge.targetPort === "top") {
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }
  const dx = Math.max(70, Math.abs(b.x - a.x) * 0.42);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

function edgeLabelPoint(source: GraphNodeView, target: GraphNodeView, edge: GraphEdgeView): { x: number; y: number } {
  const a = portPoint(source, edge.sourcePort);
  const b = portPoint(target, edge.targetPort);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 8 };
}

function portPoint(node: GraphNodeView, port: GraphEdgeView["sourcePort"]): { x: number; y: number } {
  const width = 180;
  const height = 92;
  if (port === "left") return { x: node.x, y: node.y + height / 2 };
  if (port === "right") return { x: node.x + width, y: node.y + height / 2 };
  if (port === "top") return { x: node.x + width / 2, y: node.y };
  return { x: node.x + width / 2, y: node.y + height };
}

function refreshSnapshot(setSnapshot: React.Dispatch<React.SetStateAction<DemoSnapshot>>, onSnapshot?: (snapshot: DemoSnapshot) => void) {
  fetch("/api/snapshot")
    .then((res) => res.json())
    .then((incoming: DemoSnapshot) => {
      onSnapshot?.(incoming);
      setSnapshot((current) => mergeServerSnapshot(current, incoming));
    })
    .catch(() => undefined);
}

function mergeServerSnapshot(current: DemoSnapshot, incoming: DemoSnapshot): DemoSnapshot {
  return normalizeSnapshot({
    ...incoming,
    nodes: mergeTopologyNodes(current.nodes, incoming.nodes, incoming.running),
  });
}

function resetSnapshotForScenario(snapshot: DemoSnapshot, selectedScenario: DemoScenarioId, force = false): DemoSnapshot {
  if (!force && (snapshot.running || snapshot.activeScenario === selectedScenario || !snapshot.activeScenario)) return snapshot;
  return normalizeSnapshot({
    ...snapshot,
    running: false,
    activeScenario: selectedScenario,
    nodes: snapshot.nodes.map((node) => ({ ...node, status: "idle" })),
    resources: [],
    artifacts: [],
    events: [],
    stats: {},
  });
}

function normalizeSnapshot(snapshot: DemoSnapshot): DemoSnapshot {
  return {
    ...snapshot,
    nodes: mergeTopologyNodes(defaultTopologyNodes(), snapshot.nodes, snapshot.running),
  };
}

function mergeTopologyNodes(baseNodes: DemoNode[], incomingNodes: DemoNode[], running = false): DemoNode[] {
  const byId = new Map(defaultTopologyNodes().map((node) => [node.id, node]));
  for (const node of baseNodes) byId.set(node.id, { ...byId.get(node.id), ...node });
  for (const node of incomingNodes) byId.set(node.id, { ...byId.get(node.id), ...node });
  return defaultTopologyNodes().map((node) => {
    const merged = byId.get(node.id) ?? node;
    return {
      ...node,
      ...merged,
      status: merged.status ?? (running ? "starting" : "idle"),
    };
  });
}

function defaultTopologyNodes(): DemoNode[] {
  return [
    { id: "root", label: "Root", kind: "root", endpoint: "http://127.0.0.1:8500", status: "idle" },
    { id: "registrar-1", label: "Registrar 1", kind: "registrar", endpoint: "http://127.0.0.1:8501", status: "idle" },
    { id: "registrar-2", label: "Registrar 2", kind: "registrar", endpoint: "http://127.0.0.1:8502", status: "idle" },
    { id: "registrar-3", label: "Registrar 3", kind: "registrar", endpoint: "http://127.0.0.1:8505", status: "idle" },
    { id: "cdn", label: "CDN", kind: "cdn", endpoint: "http://127.0.0.1:8503", status: "idle" },
    {
      id: "discovery-1",
      label: "Discovery 1",
      kind: "discovery",
      endpoint: "http://127.0.0.1:8506",
      domains: ["genesis.openagenet.local", "openagenet.local"],
      status: "idle",
    },
    {
      id: "discovery-2",
      label: "Discovery 2",
      kind: "discovery",
      endpoint: "http://127.0.0.1:8507",
      domains: ["genesis.openagenet.local", "openagenet.local"],
      status: "idle",
    },
    { id: "service-agent", label: "Service Agent", kind: "service-agent", endpoint: "http://127.0.0.1:9001", status: "idle" },
    { id: "user-agent", label: "User Agent", kind: "user-agent", status: "idle" },
  ];
}

function reduceEvent(snapshot: DemoSnapshot, event: DemoEvent): DemoSnapshot {
  let nodes = normalizeSnapshot(snapshot).nodes;
  if (event.nodes) nodes = mergeTopologyNodes(nodes, event.nodes, snapshot.running);
  if (event.kind === "node-started" && event.nodeId) {
    nodes = nodes.map((node) => node.id === event.nodeId ? { ...node, status: "running" } : node);
  }
  let resources = snapshot.resources;
  if (event.resource) {
    const index = resources.findIndex((resource) => resource.did === event.resource?.did);
    resources = index >= 0
      ? resources.map((resource, idx) => idx === index ? event.resource! : resource)
      : [...resources, event.resource];
  }
  let artifacts = snapshot.artifacts;
  if (event.artifact) {
    const index = artifacts.findIndex((artifact) => artifact.id === event.artifact?.id);
    artifacts = index >= 0
      ? artifacts.map((artifact, idx) => idx === index ? event.artifact! : artifact)
      : [...artifacts, event.artifact];
  }
  return normalizeSnapshot({
    ...snapshot,
    running: event.kind === "scenario-started" ? true : event.kind === "scenario-completed" || event.kind === "scenario-failed" ? false : snapshot.running,
    activeScenario: event.scenarioId ?? snapshot.activeScenario,
    nodes,
    resources,
    artifacts,
    stats: event.stats ? { ...snapshot.stats, ...event.stats } : snapshot.stats,
    events: [...snapshot.events, event].slice(-500),
  });
}

function buildGraph(snapshot: DemoSnapshot): { nodes: GraphNodeView[]; edges: GraphEdgeView[] } {
  const positions: Record<string, { x: number; y: number }> = {
    "service-agent": { x: 0, y: 430 },
    "registrar-1": { x: 210, y: 40 },
    "registrar-2": { x: 210, y: 180 },
    "registrar-3": { x: 210, y: 320 },
    root: { x: 455, y: 120 },
    cdn: { x: 455, y: 320 },
    "discovery-1": { x: 800, y: 95 },
    "discovery-2": { x: 800, y: 295 },
    "user-agent": { x: 1040, y: 430 },
  };
  const activeEdges = activeEdgeIds(snapshot);
  const doneEdges = doneEdgeIds(snapshot);
  const activeNodes = activeNodeIds(snapshot, activeEdges);
  const resourcesByNode = resourcesGroupedByNode(snapshot);
  const nodes = snapshot.nodes.map((node) => ({
    id: node.id,
    x: positions[node.id]?.x ?? 0,
    y: positions[node.id]?.y ?? 0,
    node,
    active: activeNodes.has(node.id),
    resourceText: resourcesByNode[node.id],
  }));
  const edges: GraphEdgeView[] = [
    edge("service-agent", "registrar-1", activeEdges, doneEdges, edgeLabel(snapshot, "service-agent-registrar-1")),
    edge("service-agent", "registrar-2", activeEdges, doneEdges, edgeLabel(snapshot, "service-agent-registrar-2")),
    edge("service-agent", "registrar-3", activeEdges, doneEdges, edgeLabel(snapshot, "service-agent-registrar-3")),
    edge("registrar-1", "root", activeEdges, doneEdges, edgeLabel(snapshot, "registrar-1-root")),
    edge("registrar-2", "root", activeEdges, doneEdges, edgeLabel(snapshot, "registrar-2-root")),
    edge("registrar-3", "root", activeEdges, doneEdges, edgeLabel(snapshot, "registrar-3-root")),
    edge("root", "cdn", activeEdges, doneEdges, edgeLabel(snapshot, "root-cdn")),
    edge("root", "discovery-1", activeEdges, doneEdges, edgeLabel(snapshot, "root-discovery-1")),
    edge("root", "discovery-2", activeEdges, doneEdges, edgeLabel(snapshot, "root-discovery-2")),
    edge("cdn", "discovery-1", activeEdges, doneEdges, edgeLabel(snapshot, "cdn-discovery-1")),
    edge("cdn", "discovery-2", activeEdges, doneEdges, edgeLabel(snapshot, "cdn-discovery-2")),
    edge("discovery-1", "user-agent", activeEdges, doneEdges, edgeLabel(snapshot, "discovery-1-user-agent")),
    edge("discovery-2", "user-agent", activeEdges, doneEdges, edgeLabel(snapshot, "discovery-2-user-agent")),
    edge("service-agent", "user-agent", activeEdges, doneEdges, edgeLabel(snapshot, "service-agent-user-agent"), "trust"),
  ];
  return { nodes, edges };
}

function edge(source: string, target: string, activeEdges: Set<string>, doneEdges: Set<string>, label?: string, variant?: "trust"): GraphEdgeView {
  const id = `${source}-${target}`;
  const active = activeEdges.has(id);
  const done = doneEdges.has(id);
  const verticalRootCdn = source === "root" && target === "cdn";
  const trust = variant === "trust";
  const agentToRegistrar = source === "service-agent" && target.startsWith("registrar-");
  const discoveryToUser = source.startsWith("discovery-") && target === "user-agent";
  return {
    id,
    source,
    target,
    label,
    active,
    done,
    sourcePort: verticalRootCdn ? "bottom" : agentToRegistrar ? "top" : "right",
    targetPort: verticalRootCdn ? "top" : discoveryToUser ? "top" : "left",
    curved: trust,
    trust,
  };
}

function shortDid(did: string): string {
  return `${did.slice(0, 14)}...${did.slice(-6)}`;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FlowBanner({ snapshot }: { snapshot: DemoSnapshot }) {
  const latest = snapshot.events[snapshot.events.length - 1];
  const stats = snapshot.stats;
  const total = Number(stats.total ?? 0);
  const accepted = Number(stats.accepted ?? 0);
  const percent = total > 0 ? Math.round((accepted / total) * 100) : snapshot.running ? 12 : 100;
  const phase = snapshot.running && !pipelineStarted(snapshot) ? "Starting Nodes" : snapshot.running ? "Running" : "Ready";
  return (
    <div className="flow-banner">
      <div>
        <strong>{phase}</strong>
        <span>{latest?.title ?? "Select a scenario and run it"}</span>
      </div>
      <div className="flow-progress" aria-hidden="true">
        <span style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

function activeEdgeIds(snapshot: DemoSnapshot): Set<string> {
  const active = new Set<string>();
  if (!snapshot.running) return active;
  if (!pipelineStarted(snapshot)) return active;
  const latest = snapshot.events.slice(-8);
  const add = (...ids: string[]) => ids.forEach((id) => active.add(id));
  for (const event of latest) {
    const registrarNode = event.resource?.registrarNode ?? currentRegistrarNode(snapshot);
    if (event.kind === "resource-created" || event.kind === "resource-registered") {
      add(`service-agent-${registrarNode}`);
    }
    if (event.kind === "resource-registered" || event.kind === "root-verified") {
      add(`${registrarNode}-root`);
    }
    if (event.kind === "root-verified" || event.kind === "cdn-published") add("root-cdn");
    if (event.kind === "cdn-published" || event.kind === "discovery-indexed") add("root-discovery-1", "root-discovery-2", "cdn-discovery-1", "cdn-discovery-2");
    if (event.kind === "user-discovered") add("discovery-1-user-agent", "discovery-2-user-agent");
    if (event.kind === "trusted-connected") add("service-agent-user-agent");
    if (event.kind === "pressure-progress") {
      const stats = event.stats ?? snapshot.stats;
      const registrarCounts = stats.registrarAccepted as Record<string, unknown> | undefined;
      for (const registrarId of ["registrar-1", "registrar-2", "registrar-3"]) {
        if (Number(registrarCounts?.[registrarId] ?? 0) > 0) {
          add(`service-agent-${registrarId}`, `${registrarId}-root`);
        }
      }
      if (Number(stats.rootLatest ?? 0) > 0 || Number(stats.cdnPublished ?? 0) > 0) add("root-cdn");
      if (Number(stats.cdnPublished ?? 0) > 0 || Number(stats.discoveryA ?? 0) > 0 || Number(stats.discoveryB ?? 0) > 0) {
        add("root-discovery-1", "root-discovery-2", "cdn-discovery-1", "cdn-discovery-2");
      }
    }
  }
  return active;
}

function doneEdgeIds(snapshot: DemoSnapshot): Set<string> {
  const done = new Set<string>();
  if (snapshot.running || !snapshot.events.some((event) => event.kind === "scenario-completed")) return done;
  const add = (...ids: string[]) => ids.forEach((id) => done.add(id));
  const registrarNode = currentRegistrarNode(snapshot);
  add(`service-agent-${registrarNode}`, `${registrarNode}-root`, "root-cdn", "root-discovery-1", "root-discovery-2", "cdn-discovery-1", "cdn-discovery-2");
  if (snapshot.activeScenario === "mixed-four" || snapshot.activeScenario === "mixed-1000") {
    add("service-agent-registrar-1", "service-agent-registrar-2", "service-agent-registrar-3", "registrar-1-root", "registrar-2-root", "registrar-3-root");
  }
  if (snapshot.activeScenario === "service-agent" || snapshot.events.some((event) => event.kind === "user-discovered")) {
    add("discovery-1-user-agent", "discovery-2-user-agent");
  }
  if (snapshot.events.some((event) => event.kind === "trusted-connected")) add("service-agent-user-agent");
  return done;
}

function activeNodeIds(snapshot: DemoSnapshot, activeEdges: Set<string>): Set<string> {
  const nodes = new Set<string>();
  const endpoints: Record<string, string[]> = {
    "service-agent-registrar-1": ["service-agent", "registrar-1"],
    "service-agent-registrar-2": ["service-agent", "registrar-2"],
    "service-agent-registrar-3": ["service-agent", "registrar-3"],
    "registrar-1-root": ["registrar-1", "root"],
    "registrar-2-root": ["registrar-2", "root"],
    "registrar-3-root": ["registrar-3", "root"],
    "root-cdn": ["root", "cdn"],
    "root-discovery-1": ["root", "discovery-1"],
    "root-discovery-2": ["root", "discovery-2"],
    "cdn-discovery-1": ["cdn", "discovery-1"],
    "cdn-discovery-2": ["cdn", "discovery-2"],
    "discovery-1-user-agent": ["discovery-1", "user-agent"],
    "discovery-2-user-agent": ["discovery-2", "user-agent"],
    "service-agent-user-agent": ["service-agent", "user-agent"],
  };
  activeEdges.forEach((id) => endpoints[id]?.forEach((nodeId) => nodes.add(nodeId)));
  const latest = snapshot.events[snapshot.events.length - 1];
  if (pipelineStarted(snapshot) && latest?.nodeId) nodes.add(latest.nodeId);
  return nodes;
}

function pipelineStarted(snapshot: DemoSnapshot): boolean {
  return snapshot.events.some((event) =>
    [
      "resource-created",
      "resource-registered",
      "root-verified",
      "cdn-published",
      "discovery-indexed",
      "user-discovered",
      "trusted-connected",
      "pressure-progress",
    ].includes(event.kind),
  );
}

function resourcesGroupedByNode(snapshot: DemoSnapshot): Record<string, string> {
  const groups: Record<string, number> = {};
  const add = (nodeId: string) => {
    groups[nodeId] = (groups[nodeId] ?? 0) + 1;
  };
  for (const resource of snapshot.resources) {
    if (resource.stage === "created") add("service-agent");
    if (resource.stage === "registrar") add(resource.registrarNode ?? "registrar-1");
    if (resource.stage === "root") add("root");
    if (resource.stage === "cdn") add("cdn");
    if (resource.stage === "discovery") {
      add("discovery-1");
      add("discovery-2");
    }
    if (resource.stage === "user") add("user-agent");
    if (resource.stage === "connected") {
      add("user-agent");
      add("service-agent");
    }
  }
  const stats = snapshot.stats;
  const registrarCounts = stats.registrarAccepted as Record<string, unknown> | undefined;
  if (registrarCounts) {
    groups["registrar-1"] = Number(registrarCounts["registrar-1"] ?? 0);
    groups["registrar-2"] = Number(registrarCounts["registrar-2"] ?? 0);
    groups["registrar-3"] = Number(registrarCounts["registrar-3"] ?? 0);
  }
  if (stats.rootLatest) groups.root = Number(stats.rootLatest);
  if (stats.cdnPublished) groups.cdn = Number(stats.cdnPublished);
  if (stats.discoveryA) groups["discovery-1"] = Number(stats.discoveryA);
  if (stats.discoveryB) groups["discovery-2"] = Number(stats.discoveryB);
  return Object.fromEntries(Object.entries(groups).map(([nodeId, count]) => [nodeId, `${count} resource${count === 1 ? "" : "s"}`]));
}

function currentRegistrarNode(snapshot: DemoSnapshot): "registrar-1" | "registrar-2" | "registrar-3" {
  const latestResource = [...snapshot.resources].reverse().find((resource) => resource.registrarNode);
  if (latestResource?.registrarNode === "registrar-2" || latestResource?.registrarNode === "registrar-3") return latestResource.registrarNode;
  return "registrar-1";
}

function edgeLabel(snapshot: DemoSnapshot, edgeId: string): string | undefined {
  const stats = snapshot.stats;
  if (!snapshot.activeScenario) return undefined;
  if (edgeId.includes("registrar")) {
    const registrarCounts = stats.registrarAccepted as Record<string, unknown> | undefined;
    if (registrarCounts && edgeId.includes("registrar-1")) return String(Number(registrarCounts["registrar-1"] ?? 0));
    if (registrarCounts && edgeId.includes("registrar-2")) return String(Number(registrarCounts["registrar-2"] ?? 0));
    if (registrarCounts && edgeId.includes("registrar-3")) return String(Number(registrarCounts["registrar-3"] ?? 0));
  }
  if (edgeId === "root-cdn" && stats.cdnPublished) return String(stats.cdnPublished);
  if (edgeId === "root-discovery-1" && stats.discoveryA) return String(stats.discoveryA);
  if (edgeId === "root-discovery-2" && stats.discoveryB) return String(stats.discoveryB);
  if (edgeId === "cdn-discovery-1" && stats.discoveryA) return String(stats.discoveryA);
  if (edgeId === "cdn-discovery-2" && stats.discoveryB) return String(stats.discoveryB);
  return undefined;
}

createRoot(document.getElementById("root")!).render(<App />);
