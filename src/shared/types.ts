// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

export type DemoScenarioId = "service-agent" | "mixed-four" | "mixed-1000" | "authorization-history";

export type DemoEventKind =
  | "topology"
  | "scenario-started"
  | "node-started"
  | "artifact"
  | "resource-stage"
  | "resource-created"
  | "resource-registered"
  | "root-verified"
  | "cdn-published"
  | "discovery-indexed"
  | "user-discovered"
  | "trusted-connected"
  | "pressure-progress"
  | "authorization-updated"
  | "scenario-completed"
  | "scenario-failed"
  | "log";

export interface DemoNode {
  id: string;
  label: string;
  kind: "root" | "registrar" | "discovery" | "cdn" | "publisher" | "nats" | "service-agent" | "user-agent" | "governance";
  did?: string;
  endpoint?: string;
  status?: "idle" | "starting" | "running" | "done" | "error";
  authorizationStatus?: "authorized" | "unauthorized";
  authorizationNote?: string;
  domains?: string[];
}

export interface DemoResource {
  did: string;
  type: "agent_service" | "skill" | "mcp_server" | "tool_api";
  name: string;
  tags: string[];
  ownerNode?: string;
  registrarNode?: string;
  stage:
    | "created"
    | "registrar"
    | "root"
    | "cdn"
    | "discovery"
    | "user"
    | "connected"
    | "filtered"
    | "failed";
}

export interface DemoArtifact {
  id: string;
  title: string;
  owner: string;
  resourceDid?: string;
  kind: "did-document" | "vc" | "private-key" | "registration" | "root-proof" | "package" | "discovery-response" | "summary";
  value: unknown;
  sensitive?: boolean;
}

export interface DemoEvent {
  id: number;
  at: string;
  kind: DemoEventKind;
  scenarioId?: DemoScenarioId;
  title: string;
  message?: string;
  nodeId?: string;
  resourceDid?: string;
  resource?: DemoResource;
  nodes?: DemoNode[];
  artifact?: DemoArtifact;
  stats?: Record<string, unknown>;
}

export interface DemoSnapshot {
  running: boolean;
  activeScenario?: DemoScenarioId;
  nodes: DemoNode[];
  resources: DemoResource[];
  artifacts: DemoArtifact[];
  events: DemoEvent[];
  stats: Record<string, unknown>;
}
