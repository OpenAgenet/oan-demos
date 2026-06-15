// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import type { DemoArtifact, DemoEvent, DemoEventKind, DemoNode, DemoResource, DemoScenarioId, DemoSnapshot } from "../shared/types.js";

type Listener = (event: DemoEvent) => void;

export class DemoEventBus {
  private nextId = 1;
  private listeners = new Set<Listener>();
  private snapshot: DemoSnapshot = {
    running: false,
    nodes: [],
    resources: [],
    artifacts: [],
    events: [],
    stats: {},
  };

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): DemoSnapshot {
    return this.snapshot;
  }

  reset(scenarioId: DemoScenarioId): void {
    this.nextId = 1;
    const nodes = this.snapshot.nodes.map((node) => ({ ...node, status: "starting" as const }));
    this.snapshot = {
      running: true,
      activeScenario: scenarioId,
      nodes,
      resources: [],
      artifacts: [],
      events: [],
      stats: {},
    };
  }

  finish(): void {
    this.snapshot.running = false;
  }

  setTopology(nodes: DemoNode[], scenarioId: DemoScenarioId): void {
    this.snapshot.nodes = nodes;
    this.emit({
      kind: "topology",
      scenarioId,
      title: "Topology ready",
      message: `${nodes.length} local demo nodes prepared`,
      nodes,
    });
  }

  updateNode(id: string, patch: Partial<DemoNode>, scenarioId?: DemoScenarioId): void {
    this.snapshot.nodes = this.snapshot.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node));
    const node = this.snapshot.nodes.find((entry) => entry.id === id);
    this.emit({
      kind: "node-started",
      scenarioId,
      title: `${node?.label ?? id} ${patch.status ?? "updated"}`,
      nodeId: id,
    });
  }

  updateNodeAuthorization(id: string, patch: Partial<DemoNode>, scenarioId: DemoScenarioId, title: string, message?: string, stats?: Record<string, unknown>): void {
    this.snapshot.nodes = this.snapshot.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node));
    if (stats) this.setStats(stats);
    this.emit({
      kind: "authorization-updated",
      scenarioId,
      title,
      message,
      nodeId: id,
      nodes: this.snapshot.nodes,
      stats,
    });
  }

  upsertResource(resource: DemoResource, kind: DemoEventKind, scenarioId: DemoScenarioId, title: string, message?: string): void {
    const existing = this.snapshot.resources.findIndex((entry) => entry.did === resource.did);
    if (existing >= 0) {
      this.snapshot.resources[existing] = { ...this.snapshot.resources[existing], ...resource };
    } else {
      this.snapshot.resources.push(resource);
    }
    this.emit({ kind, scenarioId, title, message, resourceDid: resource.did, resource });
  }

  addArtifact(artifact: DemoArtifact, scenarioId = this.snapshot.activeScenario, title?: string): void {
    const existing = this.snapshot.artifacts.findIndex((entry) => entry.id === artifact.id);
    if (existing >= 0) {
      this.snapshot.artifacts[existing] = artifact;
    } else {
      this.snapshot.artifacts.push(artifact);
    }
    this.emit({
      kind: "artifact",
      scenarioId,
      title: title ?? `${artifact.title} captured`,
      resourceDid: artifact.resourceDid,
      artifact,
    });
  }

  setStats(stats: Record<string, unknown>): void {
    this.snapshot.stats = { ...this.snapshot.stats, ...stats };
  }

  emit(input: Omit<DemoEvent, "id" | "at">): DemoEvent {
    const event: DemoEvent = {
      id: this.nextId++,
      at: new Date().toISOString(),
      ...input,
    };
    if (event.stats) this.setStats(event.stats);
    this.snapshot.events = [...this.snapshot.events, event].slice(-500);
    for (const listener of this.listeners) listener(event);
    return event;
  }
}
