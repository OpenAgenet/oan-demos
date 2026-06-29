// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import type { DemoArtifact, DemoNode, DemoResource, DemoScenarioId } from "../shared/types.js";
import type { DemoEventBus } from "./event-bus.js";
import {
  adminToken,
  buildResourceRegistrationFixture,
  canonicalJson,
  copyDir,
  copyGenesisNodeIdentity,
  createBenchmarkEnvironment,
  createNatsRuntime,
  createNodeRuntime,
  createResourceIdentity,
  ensureDir,
  ensurePostgresDatabasesFromConfigs,
  ensureServiceBinariesAsync,
  genesisNodesRoot,
  getJson,
  listDiscoveryCandidates,
  loadIdentityMaterial,
  nowIso,
  persistIdentityMaterial,
  postJson,
  readJson,
  resetDir,
  rootFixtureRoot,
  runWithConcurrency,
  seedRootBulletin,
  sleep,
  startNats,
  startNode,
  stopNats,
  stopNode,
  uniqueRootEventStreamProfile,
  userAgentFixtureRoot,
  writeBenchmarkCdnConfig,
  writeBenchmarkCdnPublisherConfig,
  writeBenchmarkDiscoveryConfig,
  writeBenchmarkRegistrarConfig,
  writeBenchmarkRootConfig,
  writeGenesisAuthorizationState,
  writeJson,
} from "./runtime/shared.js";
import {
  buildTrustedInvocation,
  postJsonAllowFailure,
  sha256Canonical,
  signValue,
  startPythonAgent,
  stopProcessTree,
  waitForHttpHealth,
} from "./runtime/example-flows.js";

const scenarioIds = new Set(["service-agent", "mixed-four", "mixed-1000", "authorization-history", "agentic-commerce"]);
const demoDomains = ["*"];

interface DemoRuntime {
  rootPort: number;
  cdnPort: number;
  publisherPort: number;
  natsPort: number;
  registrarPorts: number[];
  discoveryPorts: number[];
  serviceAgentPort: number;
}

const runtime: DemoRuntime = {
  rootPort: 8500,
  cdnPort: 8503,
  publisherPort: 8510,
  natsPort: Number.parseInt(process.env.OAN_DEMO_NATS_PORT ?? "4522", 10),
  registrarPorts: [8501, 8502, 8505],
  discoveryPorts: [8506, 8507],
  serviceAgentPort: 9001,
};

type ResourceType = "agent_service" | "skill" | "mcp_server" | "tool_api";

interface DemoContext {
  scenarioId: DemoScenarioId;
  environment: ReturnType<typeof createBenchmarkEnvironment>;
  natsRuntime: ReturnType<typeof createNatsRuntime>;
  nodes: ReturnType<typeof createNodeRuntime>[];
  dirs: {
    root: string;
    cdn: string;
    registrars: string[];
    discoveries: string[];
    serviceAgent: string;
    userAgent: string;
    config: string;
    demoArtifacts: string;
  };
  serviceAgent?: any;
}

export async function runScenario(rawScenarioId: string, bus: DemoEventBus): Promise<void> {
  if (!scenarioIds.has(rawScenarioId)) {
    throw new Error(`Unknown scenario: ${rawScenarioId}`);
  }
  const scenarioId = rawScenarioId as DemoScenarioId;
  bus.reset(scenarioId);
  bus.emit({
    kind: "scenario-started",
    scenarioId,
    title: scenarioTitle(scenarioId),
    message: scenarioId === "authorization-history" ? "Replaying chain governance history" : "Preparing local OAN topology",
  });
  if (scenarioId === "authorization-history") {
    try {
      await runAuthorizationHistoryScenario(scenarioId, bus);
      bus.emit({ kind: "scenario-completed", scenarioId, title: "Scenario completed", message: "Authorization history replay completed" });
    } catch (error) {
      bus.emit({
        kind: "scenario-failed",
        scenarioId,
        title: "Scenario failed",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      bus.finish();
    }
    return;
  }
  if (scenarioId === "agentic-commerce") {
    try {
      await runAgenticCommerceScenario(scenarioId, bus);
      bus.emit({ kind: "scenario-completed", scenarioId, title: "Scenario completed", message: "Agentic commerce flow completed" });
    } catch (error) {
      bus.emit({
        kind: "scenario-failed",
        scenarioId,
        title: "Scenario failed",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      bus.finish();
    }
    return;
  }
  bus.setTopology(runtimeTopologyNodes(scenarioId), scenarioId);
  let context: DemoContext | undefined;
  try {
    context = prepareContext(scenarioId, bus);
    await startContext(context, bus);
    if (scenarioId === "service-agent") {
      await runServiceAgentScenario(context, bus);
    } else if (scenarioId === "mixed-four") {
      await runMixedFourScenario(context, bus);
    } else {
      await runMixed1000Scenario(context, bus);
    }
    bus.emit({ kind: "scenario-completed", scenarioId, title: "Scenario completed", message: "All demo checks completed" });
  } catch (error) {
    bus.emit({
      kind: "scenario-failed",
      scenarioId,
      title: "Scenario failed",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    if (context) await stopContext(context);
    bus.finish();
  }
}

function scenarioTitle(scenarioId: DemoScenarioId): string {
  if (scenarioId === "service-agent") return "One Agent registration and trusted connection";
  if (scenarioId === "mixed-four") return "Four OAN resource types";
  if (scenarioId === "authorization-history") return "Chain authorization history replay";
  if (scenarioId === "agentic-commerce") return "Agentic Commerce: e-commerce to intelligent economy";
  return "1000 mixed resources pipeline";
}

function runtimeTopologyNodes(_scenarioId: DemoScenarioId): DemoNode[] {
  return [
    node("root", "Root", "root", undefined, runtime.rootPort),
    ...runtime.registrarPorts.map((port, index) => node(`registrar-${index + 1}`, `Registrar ${index + 1}`, "registrar", undefined, port)),
    node("cdn", "CDN", "cdn", undefined, runtime.cdnPort),
    ...runtime.discoveryPorts.map((port, index) => node(`discovery-${index + 1}`, `Discovery ${index + 1}`, "discovery", undefined, port, demoDomains)),
    node("service-agent", "Service Agent", "service-agent", undefined, runtime.serviceAgentPort),
    node("user-agent", "User Agent", "user-agent", undefined, undefined),
  ];
}

async function runAgenticCommerceScenario(scenarioId: DemoScenarioId, bus: DemoEventBus): Promise<void> {
  const agents = commerceAgents();
  bus.setTopology(commerceTopologyNodes(), scenarioId);
  bus.setStats({ total: agents.length, current: 0, accepted: 0 });
  bus.addArtifact({
    id: "commerce:intent",
    title: "User buying intent",
    owner: "commerce-user",
    kind: "commerce",
    value: {
      intentId: "intent-business-laptop-001",
      userGoal: "Buy a lightweight laptop suitable for business travel under CNY 8,000.",
      constraints: ["budget<=8000", "weight<=1.4kg", "delivery<=48h", "invoice_required=true"],
      status: "created",
    },
  }, scenarioId);
  await sleep(800);

  for (let index = 0; index < agents.length; index++) {
    const agent = agents[index];
    const resource = commerceResource(agent);
    bus.upsertResource(resource, "resource-created", scenarioId, `${agent.label} DID Document prepared`, agent.description);
    bus.addArtifact(commerceDidArtifact(agent), scenarioId);
    await sleep(350);
    bus.upsertResource({ ...resource, stage: "registrar", registrarNode: "registrar-1" }, "resource-registered", scenarioId, `${agent.label} submitted to Registrar`, "Business service resource accepted by the governed registration path.");
    bus.setStats({ total: agents.length, current: index + 1, accepted: index + 1 });
    await sleep(300);
  }

  bus.emit({
    kind: "root-verified",
    scenarioId,
    title: "Root accepted commerce agent resources",
    message: "Platform, merchant, payment, logistics, and after-sales capability are approved for trusted discovery.",
    stats: { total: agents.length, current: agents.length, accepted: agents.length, rootLatest: agents.length },
  });
  await sleep(2700);
  bus.emit({
    kind: "cdn-published",
    scenarioId,
    title: "CDN published commerce resource packages",
    message: "Root-approved resource packages are available for Discovery nodes.",
    stats: { cdnPublished: agents.length },
  });
  await sleep(900);
  bus.emit({
    kind: "discovery-indexed",
    scenarioId,
    title: "Discovery indexed commerce agents",
    message: "User Agent can now search trusted commerce capabilities.",
    stats: { discoveryA: agents.length, discoveryB: agents.length },
  });
  await sleep(900);

  const steps = [
    {
      title: "User Agent selects trusted Platform Agent",
      message: "Discovery returns a Root-approved candidate with DID Document hash and capability tags.",
      active: "commerce-discovery-user",
      artifact: {
        id: "commerce:discovery-candidate",
        title: "Trusted discovery candidate",
        owner: "commerce-user",
        kind: "commerce" as const,
        value: {
          query: {
            capability: "trusted_commerce_orchestration",
            constraints: ["authorized_domain=openagenet.local", "vc_required=true", "after_sales_required=true"],
          },
          selectedCandidate: {
            agent: "commerce-platform-agent",
            did: "did:oan:AGDM:commercePlatformAgent00000001",
            source: "Discovery",
            trustPath: ["Registrar", "Root", "CDN", "Discovery"],
            capabilityTags: ["commerce", "marketplace", "recommendation"],
          },
        },
      },
    },
    {
      title: "User and Platform exchange trust material",
      message: "Both sides exchange DID Documents and VCs, verify signatures, and establish a trusted session.",
      active: "commerce-user-platform",
      artifact: {
        id: "commerce:trust-session",
        title: "Verified agent session",
        owner: "commerce-user",
        kind: "commerce" as const,
        value: {
          sessionId: "commerce-session-001",
          initiator: "commerce-user-agent",
          responder: "commerce-platform-agent",
          checks: [
            "platform_did_document_hash_matches_discovery_candidate",
            "platform_vc_signature_valid",
            "user_vc_signature_valid",
            "challenge_response_completed",
            "session_policy_bound_to_purchase_intent",
          ],
          status: "verified",
        },
      },
    },
    {
      title: "User Agent expresses purchase intent",
      message: "The verified session carries an intent token: business laptop under CNY 8,000.",
      active: "commerce-user-platform",
      artifact: {
        id: "commerce:brief",
        title: "Shopping brief",
        owner: "commerce-user",
        kind: "commerce" as const,
        value: {
          requestedBy: "commerce-user-agent",
          sentTo: "commerce-platform-agent",
          criteria: ["business travel", "lightweight", "budget controlled", "trusted seller"],
        },
      },
    },
    {
      title: "Platform Agent asks Merchant for a quote",
      message: "Merchant Agent returns signed price, stock, invoice, delivery, and after-sales commitments.",
      active: "commerce-platform-merchant-a",
      artifact: {
        id: "commerce:quotes",
        title: "Merchant quote",
        owner: "commerce-platform",
        kind: "commerce" as const,
        value: {
          quotes: [
            {
              merchant: "merchant-a",
              item: "ThinkBook Air 14",
              priceCny: 7699,
              stock: 12,
              deliveryHours: 36,
              afterSales: ["invoice", "warranty", "return_or_exchange", "service_context"],
            },
          ],
          verification: "DID and VC verified before quote acceptance",
        },
      },
    },
    {
      title: "User Agent accepts Merchant offer",
      message: "The offer satisfies budget, delivery, invoice, and after-sales constraints.",
      active: "commerce-user-merchant-a",
      artifact: {
        id: "commerce:order",
        title: "Order draft",
        owner: "commerce-user",
        kind: "commerce" as const,
        value: {
          orderId: "oan-commerce-demo-order-001",
          merchant: "merchant-a",
          item: "ThinkBook Air 14",
          priceCny: 7699,
          status: "awaiting_payment",
        },
      },
    },
    {
      title: "Payment Agent authorizes payment",
      message: "Payment confirmation is returned after VC verification.",
      active: "commerce-user-payment",
      artifact: {
        id: "commerce:payment",
        title: "Payment confirmation",
        owner: "commerce-payment",
        kind: "commerce" as const,
        value: {
          paymentId: "pay-demo-20260615-001",
          amountCny: 7699,
          payer: "commerce-user-agent",
          payee: "merchant-a",
          status: "authorized",
        },
      },
    },
    {
      title: "Merchant Agent books logistics",
      message: "Logistics Agent commits 36-hour delivery with signed tracking data.",
      active: "commerce-merchant-a-logistics",
      artifact: {
        id: "commerce:shipping",
        title: "Logistics commitment",
        owner: "commerce-logistics",
        kind: "commerce" as const,
        value: {
          shipmentId: "ship-demo-001",
          carrier: "OAN Express Agent",
          deliveryHours: 36,
          status: "scheduled",
        },
      },
    },
    {
      title: "Merchant Agent keeps after-sales context",
      message: "Warranty, invoice, and service context stay bound to the trusted order envelope.",
      active: "commerce-user-merchant-a",
      artifact: {
        id: "commerce:receipt",
        title: "Trusted commerce receipt",
        owner: "commerce-merchant-a",
        kind: "commerce" as const,
        value: {
          receiptId: "receipt-demo-001",
          orderId: "oan-commerce-demo-order-001",
          verifiedAgents: agents.map((agent) => agent.did),
          businessState: "paid_and_scheduled",
        },
      },
    },
  ];

  for (const [index, step] of steps.entries()) {
    bus.addArtifact(step.artifact, scenarioId, `${step.artifact.title} captured`);
    bus.emit({
      kind: "commerce-step",
      scenarioId,
      title: step.title,
      message: step.message,
      nodeId: step.active,
      stats: { commerceStep: index + 1, commerceTotal: steps.length, activeCommerceEdge: step.active },
    });
    await sleep(3300);
  }
  bus.emit({
    kind: "trusted-connected",
    scenarioId,
    title: "Trusted business connection completed",
    message: "User intent was fulfilled by verified commerce agents across platform, merchant, payment, logistics, and after-sales capabilities.",
    stats: { commerceStep: steps.length, commerceTotal: steps.length, activeCommerceEdge: "commerce-user-merchant-a" },
  });
}

interface CommerceAgentSpec {
  id: string;
  label: string;
  did: string;
  type: ResourceType;
  tags: string[];
  description: string;
}

function commerceAgents(): CommerceAgentSpec[] {
  return [
    { id: "commerce-platform", label: "Platform Agent", did: "did:oan:AGDM:commercePlatformAgent00000001", type: "agent_service", tags: ["commerce", "marketplace", "recommendation"], description: "Aggregates offers and orchestrates commerce workflows." },
    { id: "commerce-merchant-a", label: "Merchant Agent", did: "did:oan:AGDM:commerceMerchantAgentA000001", type: "agent_service", tags: ["commerce", "merchant", "inventory", "after-sales"], description: "Provides product quote, stock, invoice, fulfillment, warranty, and after-sales service context." },
    { id: "commerce-payment", label: "Payment Agent", did: "did:oan:AGDM:commercePaymentAgent00000001", type: "agent_service", tags: ["commerce", "payment", "settlement"], description: "Authorizes payment after identity and order verification." },
    { id: "commerce-logistics", label: "Logistics Agent", did: "did:oan:AGDM:commerceLogisticsAgent000001", type: "agent_service", tags: ["commerce", "logistics", "delivery"], description: "Commits shipment and tracking data for the selected order." },
  ];
}

function commerceTopologyNodes(): DemoNode[] {
  return [
    node("root", "Root", "root", undefined, runtime.rootPort),
    node("registrar-1", "Registrar", "registrar", undefined, runtime.registrarPorts[0]),
    node("cdn", "CDN", "cdn", undefined, runtime.cdnPort),
    node("discovery-1", "Discovery", "discovery", undefined, runtime.discoveryPorts[0], demoDomains),
    { id: "commerce-user", label: "User Agent", kind: "user-agent", status: "idle" },
    ...commerceAgents().map((agent) => ({
      id: agent.id,
      label: agent.label,
      kind: "commerce-agent" as const,
      did: agent.did,
      endpoint: agent.tags.join(" / "),
      status: "idle" as const,
    })),
  ];
}

function commerceResource(agent: CommerceAgentSpec): DemoResource {
  return {
    did: agent.did,
    type: agent.type,
    name: agent.label,
    tags: agent.tags,
    ownerNode: agent.id,
    registrarNode: "registrar-1",
    stage: "created",
  };
}

function commerceDidArtifact(agent: CommerceAgentSpec): DemoArtifact {
  return {
    id: `${agent.did}:did`,
    title: `${agent.label} DID Document`,
    owner: agent.id,
    resourceDid: agent.did,
    kind: "did-document",
    value: {
      "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/oan/v1"],
      id: agent.did,
      service: [{ id: `${agent.did}#commerce-api`, type: "AgentService", serviceEndpoint: `demo://${agent.id}` }],
      oanMetadata: {
        resourceType: agent.type,
        identityType: "commerce-agent",
        capabilityTags: agent.tags,
        resourceDescription: {
          name: agent.label,
          description: agent.description,
          useCaseExamples: ["Trusted discovery", "VC verification", "Agentic commerce workflow"],
        },
      },
    },
  };
}

interface AuthorizationReplayEvent {
  time: string;
  proposalId: string;
  eventSequence: string;
  nodeId: "root" | "registrar-1" | "registrar-2" | "registrar-3" | "discovery-1" | "discovery-2";
  nodeName: string;
  role: string;
  action: "authorized" | "unauthorized" | "unchanged";
  label: string;
  note: string;
}

async function runAuthorizationHistoryScenario(scenarioId: DemoScenarioId, bus: DemoEventBus): Promise<void> {
  bus.setTopology(authorizationTopologyNodes(), scenarioId);
  const events = authorizationReplayEvents();
  bus.setStats({ total: events.length, current: 0, authorized: 0 });
  await sleep(1000);
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    const patch: Partial<DemoNode> = {
      authorizationNote: `${event.label}: ${event.note}`,
    };
    if (event.action === "authorized") {
      patch.authorizationStatus = "authorized";
      patch.status = "running";
    } else if (event.action === "unauthorized") {
      patch.authorizationStatus = "unauthorized";
      patch.status = "idle";
    }
    const currentNodes = bus.getSnapshot().nodes.map((node) => (node.id === event.nodeId ? { ...node, ...patch } : node));
    const authorized = currentNodes.filter((node) => node.authorizationStatus === "authorized").length;
    bus.updateNodeAuthorization(
      event.nodeId,
      patch,
      scenarioId,
      `${event.nodeName} ${event.label}`,
      `${event.time}; proposal ${event.proposalId}; event ${event.eventSequence}; ${event.note}`,
      {
        total: events.length,
        current: index + 1,
        authorized,
        latestProposalId: event.proposalId,
        latestEventSequence: event.eventSequence,
      },
    );
    await sleep(1000);
  }
}

function authorizationTopologyNodes(): DemoNode[] {
  const readDid = (name: string): string | undefined => {
    const didPath = path.join(genesisNodesRoot, name, "did-document.json");
    return fs.existsSync(didPath) ? String(readJson<any>(didPath).id) : undefined;
  };
  return [
    {
      id: "root",
      label: "Root",
      kind: "root",
      did: readDid("genesis-root"),
      endpoint: "Trust anchor",
      status: "idle",
      authorizationStatus: "unauthorized",
      authorizationNote: "Waiting for replay",
    },
    ...[1, 2, 3].map((index) => ({
      id: `registrar-${index}`,
      label: `Registrar ${index}`,
      kind: "registrar" as const,
      did: readDid(`genesis-registrar-${index}`),
      endpoint: `https://registrar-${index}.genesis.openagenet.local`,
      status: "idle" as const,
      authorizationStatus: "unauthorized" as const,
      authorizationNote: "Waiting for replay",
    })),
    {
      id: "cdn",
      label: "CDN",
      kind: "cdn",
      endpoint: "Not governed in replay",
      status: "idle",
      authorizationNote: "Outside chain authorization replay",
    },
    ...[1, 2].map((index) => ({
      id: `discovery-${index}`,
      label: `Discovery ${index}`,
      kind: "discovery" as const,
      did: readDid(`genesis-discovery-${index}`),
      endpoint: `https://discovery-${index}.genesis.openagenet.local`,
      domains: demoDomains,
      status: "idle" as const,
      authorizationStatus: "unauthorized" as const,
      authorizationNote: "Waiting for replay",
    })),
    {
      id: "service-agent",
      label: "Service Agent",
      kind: "service-agent",
      endpoint: "Not governed in replay",
      status: "idle",
      authorizationNote: "Outside chain authorization replay",
    },
    {
      id: "user-agent",
      label: "User Agent",
      kind: "user-agent",
      status: "idle",
      authorizationNote: "Outside chain authorization replay",
    },
  ];
}

function authorizationReplayEvents(): AuthorizationReplayEvent[] {
  return [
    { time: "2026-06-04 confirmed", proposalId: "-", eventSequence: "-", nodeId: "root", nodeName: "Root", role: "root", action: "authorized", label: "authorized", note: "Root trust anchor active" },
    { time: "2026-06-04 confirmed", proposalId: "1", eventSequence: "not recorded", nodeId: "registrar-1", nodeName: "genesis-registrar-1 legacy DID", role: "registrar", action: "authorized", label: "authorized", note: "Legacy did:oan:REG:* authorization" },
    { time: "2026-06-04 confirmed", proposalId: "2", eventSequence: "not recorded", nodeId: "registrar-2", nodeName: "genesis-registrar-2 legacy DID", role: "registrar", action: "authorized", label: "authorized", note: "Legacy DID authorization" },
    { time: "2026-06-04 confirmed", proposalId: "3", eventSequence: "not recorded", nodeId: "registrar-3", nodeName: "genesis-registrar-3 legacy DID", role: "registrar", action: "authorized", label: "authorized", note: "Legacy DID authorization" },
    { time: "2026-06-04 confirmed", proposalId: "4", eventSequence: "not recorded", nodeId: "discovery-1", nodeName: "genesis-discovery-1 legacy DID", role: "discovery", action: "authorized", label: "authorized", note: "Legacy did:oan:DISC:* authorization" },
    { time: "2026-06-04 confirmed", proposalId: "5", eventSequence: "not recorded", nodeId: "discovery-2", nodeName: "genesis-discovery-2 legacy DID", role: "discovery", action: "authorized", label: "authorized", note: "Legacy DID authorization" },
    { time: "2026-06-04 confirmed", proposalId: "6", eventSequence: "6", nodeId: "registrar-1", nodeName: "genesis-registrar-1", role: "registrar", action: "authorized", label: "authorized", note: "Normalized did:oan:INRG:* DID" },
    { time: "2026-06-04 confirmed", proposalId: "7", eventSequence: "7", nodeId: "registrar-2", nodeName: "genesis-registrar-2", role: "registrar", action: "authorized", label: "authorized", note: "Normalized DID" },
    { time: "2026-06-04 confirmed", proposalId: "8", eventSequence: "8", nodeId: "registrar-3", nodeName: "genesis-registrar-3", role: "registrar", action: "authorized", label: "authorized", note: "Normalized DID" },
    { time: "2026-06-04 confirmed", proposalId: "9", eventSequence: "9", nodeId: "discovery-1", nodeName: "genesis-discovery-1", role: "discovery", action: "authorized", label: "authorized", note: "Authorized domains: *" },
    { time: "2026-06-04 confirmed", proposalId: "10", eventSequence: "10", nodeId: "discovery-2", nodeName: "genesis-discovery-2", role: "discovery", action: "authorized", label: "authorized", note: "Authorized domains: *" },
    { time: "2026-06-04 confirmed", proposalId: "11", eventSequence: "11", nodeId: "registrar-1", nodeName: "genesis-registrar-1 legacy DID", role: "registrar", action: "unchanged", label: "legacy revoked", note: "Legacy REG DID revoked; normalized DID remains authorized" },
    { time: "2026-06-04 confirmed", proposalId: "12", eventSequence: "12", nodeId: "registrar-2", nodeName: "genesis-registrar-2 legacy DID", role: "registrar", action: "unchanged", label: "legacy revoked", note: "Legacy REG DID revoked; normalized DID remains authorized" },
    { time: "2026-06-04 confirmed", proposalId: "13", eventSequence: "13", nodeId: "registrar-3", nodeName: "genesis-registrar-3 legacy DID", role: "registrar", action: "unchanged", label: "legacy revoked", note: "Legacy REG DID revoked; normalized DID remains authorized" },
    { time: "2026-06-04 confirmed", proposalId: "14", eventSequence: "14", nodeId: "discovery-1", nodeName: "genesis-discovery-1 legacy DID", role: "discovery", action: "unchanged", label: "legacy revoked", note: "Legacy DISC DID revoked; normalized DID remains authorized" },
    { time: "2026-06-04 confirmed", proposalId: "15", eventSequence: "15", nodeId: "discovery-2", nodeName: "genesis-discovery-2 legacy DID", role: "discovery", action: "unchanged", label: "legacy revoked", note: "Legacy DISC DID revoked; normalized DID remains authorized" },
    { time: "2026-06-04 audit", proposalId: "16-20", eventSequence: "-", nodeId: "root", nodeName: "5 active nodes", role: "registrar/discovery", action: "unchanged", label: "duplicate rejected", note: "Contract rejected duplicate authorize attempts for active subjects" },
    { time: "2026-06-04 audit", proposalId: "21", eventSequence: "16", nodeId: "registrar-1", nodeName: "genesis-registrar-1", role: "registrar", action: "unauthorized", label: "suspended", note: "DID Document metadata refresh" },
    { time: "2026-06-04 audit", proposalId: "22", eventSequence: "17", nodeId: "registrar-1", nodeName: "genesis-registrar-1", role: "registrar", action: "authorized", label: "recovered", note: "Current active event" },
    { time: "2026-06-04 audit", proposalId: "23", eventSequence: "18", nodeId: "registrar-2", nodeName: "genesis-registrar-2", role: "registrar", action: "unauthorized", label: "suspended", note: "DID document refresh" },
    { time: "2026-06-04 audit", proposalId: "24", eventSequence: "19", nodeId: "registrar-2", nodeName: "genesis-registrar-2", role: "registrar", action: "authorized", label: "recovered", note: "Current active event" },
    { time: "2026-06-04 audit", proposalId: "25", eventSequence: "20", nodeId: "registrar-3", nodeName: "genesis-registrar-3", role: "registrar", action: "unauthorized", label: "suspended", note: "DID document refresh" },
    { time: "2026-06-04 audit", proposalId: "26", eventSequence: "21", nodeId: "registrar-3", nodeName: "genesis-registrar-3", role: "registrar", action: "authorized", label: "recovered", note: "Current active event" },
    { time: "2026-06-04 audit", proposalId: "27", eventSequence: "22", nodeId: "discovery-1", nodeName: "genesis-discovery-1", role: "discovery", action: "unauthorized", label: "suspended", note: "DID document refresh; authorized domains retained on-chain" },
    { time: "2026-06-04 audit", proposalId: "28", eventSequence: "23", nodeId: "discovery-1", nodeName: "genesis-discovery-1", role: "discovery", action: "authorized", label: "recovered", note: "Current active event" },
    { time: "2026-06-04 audit", proposalId: "29", eventSequence: "24", nodeId: "discovery-2", nodeName: "genesis-discovery-2", role: "discovery", action: "unauthorized", label: "suspended", note: "DID document refresh; authorized domains retained on-chain" },
    { time: "2026-06-04 audit", proposalId: "30", eventSequence: "25", nodeId: "discovery-2", nodeName: "genesis-discovery-2", role: "discovery", action: "authorized", label: "recovered", note: "Current active event" },
  ];
}

function prepareContext(scenarioId: DemoScenarioId, bus: DemoEventBus): DemoContext {
  const environment = createBenchmarkEnvironment(`oan-demo-${scenarioId}`);
  const eventProfile = uniqueRootEventStreamProfile(environment.runId, runtime.natsPort);
  const natsRuntime = createNatsRuntime(environment.pidDir);
  const config = path.join(environment.workDir, "config");
  const root = path.join(environment.workDir, "root");
  const cdn = path.join(environment.workDir, "cdn");
  const registrars = ["registrar-a", "registrar-b", "registrar-c"].map((name) => path.join(environment.workDir, name));
  const discoveries = ["discovery-a", "discovery-b"].map((name) => path.join(environment.workDir, name));
  const serviceAgent = path.join(environment.workDir, "data", "demo-service-agent");
  const userAgent = path.join(environment.workDir, "data", "user-agent");
  const demoArtifacts = path.join(environment.workDir, "demo-artifacts");
  ensureDir(config);

  const rootIdentity = copyGenesisNodeIdentity("genesis-root", root, { endpoint: `http://localhost:${runtime.rootPort}` });
  const registrarIdentities = registrars.map((dir, index) =>
    copyGenesisNodeIdentity(`genesis-registrar-${index + 1}`, dir, { endpoint: `http://localhost:${runtime.registrarPorts[index]}` }),
  );
  const discoveryIdentities = discoveries.map((dir, index) =>
    copyGenesisNodeIdentity(`genesis-discovery-${index + 1}`, dir, { endpoint: `http://localhost:${runtime.discoveryPorts[index]}` }),
  );
  bus.setTopology(
    [
      node("root", "Root", "root", rootIdentity.did, runtime.rootPort),
      ...registrarIdentities.map((identity, index) => node(`registrar-${index + 1}`, `Registrar ${index + 1}`, "registrar", identity.did, runtime.registrarPorts[index])),
      node("cdn", "CDN", "cdn", undefined, runtime.cdnPort),
      ...discoveryIdentities.map((identity, index) =>
        node(`discovery-${index + 1}`, `Discovery ${index + 1}`, "discovery", identity.did, runtime.discoveryPorts[index], demoDomains),
      ),
      node("service-agent", "Service Agent", "service-agent", undefined, runtime.serviceAgentPort),
      node("user-agent", "User Agent", "user-agent", undefined, undefined),
    ],
    scenarioId,
  );
  seedRootBulletin(rootFixtureRoot, root, { cdnPort: runtime.cdnPort });
  writeGenesisAuthorizationState(root, { registrarDirs: registrars, discoveryDirs: discoveries, authorizedDomains: demoDomains });
  writeJson(path.join(root, "request-nonces.json"), { nonces: {} });

  for (const dir of [
    path.join(root, "archive"),
    path.join(root, "indexes"),
    path.join(root, "queues"),
    path.join(root, "resource-packages"),
    path.join(root, "resources"),
    ...registrars.flatMap((dir) => [path.join(dir, "drafts"), path.join(dir, "records"), path.join(dir, "resource-records")]),
    ...discoveries.map((dir) => path.join(dir, "index")),
    path.join(cdn, "documents"),
    path.join(cdn, "metadata"),
    path.join(cdn, "packages"),
    path.join(cdn, "resources"),
    demoArtifacts,
    serviceAgent,
    userAgent,
  ]) {
    resetDir(dir);
  }
  for (const dir of discoveries) writeJson(path.join(dir, "index", "capabilities.json"), []);
  writeJson(path.join(cdn, "manifest.json"), { version: "0.1.0", generatedAt: nowIso(), rootDid: "", packages: [] });
  mirrorInfrastructureDataForAgents(environment.workDir, { rootDir: root, registrarDir: registrars[0], discoveryDir: discoveries[0] });
  copyDir(userAgentFixtureRoot, userAgent);
  issueUserAgentCredential(userAgent, registrarIdentities[0]);

  writeBenchmarkRootConfig(path.join(config, "root.toml"), runtime, rootIdentity.did, { events: eventProfile });
  writeBenchmarkRegistrarConfig(path.join(config, "registrar-a.toml"), { ...runtime, registrarPort: runtime.registrarPorts[0] }, rootIdentity.did, "registrar-a");
  writeBenchmarkRegistrarConfig(path.join(config, "registrar-b.toml"), { ...runtime, registrarPort: runtime.registrarPorts[1] }, rootIdentity.did, "registrar-b");
  writeBenchmarkRegistrarConfig(path.join(config, "registrar-c.toml"), { ...runtime, registrarPort: runtime.registrarPorts[2] }, rootIdentity.did, "registrar-c");
  writeBenchmarkDiscoveryConfig(path.join(config, "discovery-a.toml"), { ...runtime, discoveryPort: runtime.discoveryPorts[0] }, "discovery-a");
  writeBenchmarkDiscoveryConfig(path.join(config, "discovery-b.toml"), { ...runtime, discoveryPort: runtime.discoveryPorts[1] }, "discovery-b");
  writeBenchmarkCdnConfig(path.join(config, "cdn.toml"), runtime, rootIdentity.did);
  writeBenchmarkCdnPublisherConfig(path.join(config, "cdn-publisher.toml"), runtime, {
    events: eventProfile,
    rootKeysDirRelative: "../root/keys",
  });
  ensurePostgresDatabasesFromConfigs([
    path.join(config, "root.toml"),
    path.join(config, "registrar-a.toml"),
    path.join(config, "registrar-b.toml"),
    path.join(config, "registrar-c.toml"),
    path.join(config, "discovery-a.toml"),
    path.join(config, "discovery-b.toml"),
    path.join(config, "cdn.toml"),
  ]);

  const nodes = [
    createNodeRuntime(environment.pidDir, "root", "root-node", path.join(config, "root.toml"), runtime.rootPort),
    createNodeRuntime(environment.pidDir, "registrar-a", "registrar-node", path.join(config, "registrar-a.toml"), runtime.registrarPorts[0]),
    createNodeRuntime(environment.pidDir, "registrar-b", "registrar-node", path.join(config, "registrar-b.toml"), runtime.registrarPorts[1]),
    createNodeRuntime(environment.pidDir, "registrar-c", "registrar-node", path.join(config, "registrar-c.toml"), runtime.registrarPorts[2]),
    createNodeRuntime(environment.pidDir, "discovery-a", "discovery-node", path.join(config, "discovery-a.toml"), runtime.discoveryPorts[0]),
    createNodeRuntime(environment.pidDir, "discovery-b", "discovery-node", path.join(config, "discovery-b.toml"), runtime.discoveryPorts[1]),
    createNodeRuntime(environment.pidDir, "cdn", "cdn-node", path.join(config, "cdn.toml"), runtime.cdnPort),
    createNodeRuntime(environment.pidDir, "cdn-publisher", "cdn-publisher", path.join(config, "cdn-publisher.toml"), runtime.publisherPort),
  ];

  addNodeArtifacts(bus, scenarioId, "root", root);
  registrars.forEach((dir, index) => addNodeArtifacts(bus, scenarioId, `registrar-${index + 1}`, dir));
  discoveries.forEach((dir, index) => addNodeArtifacts(bus, scenarioId, `discovery-${index + 1}`, dir));

  writeJson(path.join(demoArtifacts, "README.json"), {
    title: "OAN demo artifacts",
    note: "DID documents, registration credentials, Root/CDN packages, and VC exchange envelopes captured for demo review.",
    generatedAt: nowIso(),
    scenarioId,
  });

  return { scenarioId, environment, natsRuntime, nodes, dirs: { root, cdn, registrars, discoveries, serviceAgent, userAgent, config, demoArtifacts } };
}

function node(id: string, label: string, kind: DemoNode["kind"], did?: string, port?: number, domains?: string[]): DemoNode {
  return {
    id,
    label,
    kind,
    did,
    endpoint: port ? `http://127.0.0.1:${port}` : undefined,
    domains,
    status: "idle",
  };
}

async function startContext(context: DemoContext, bus: DemoEventBus): Promise<void> {
  bus.emit({ kind: "node-started", scenarioId: context.scenarioId, title: "Checking service binaries", message: "Verifying Root, Registrar, Discovery, CDN, and publisher services" });
  await ensureServiceBinariesAsync(["root-node", "registrar-node", "discovery-node", "cdn-node", "cdn-publisher"]);
  await startNats(context.natsRuntime, runtime.natsPort);
  bus.emit({ kind: "node-started", scenarioId: context.scenarioId, title: "NATS JetStream running", message: `Port ${runtime.natsPort}` });
  if (context.scenarioId === "service-agent") {
    await startNodesSerially(context, bus);
  } else {
    await startNodesInPhases(context, bus);
  }
  if (context.scenarioId === "service-agent") {
    context.serviceAgent = startPythonAgent(
      "service-agent-python",
      ["run", "--project", "agents/service-agent-python", "python", "-m", "service_agent.main"],
      context.environment.pidDir,
      context.environment.workDir,
    );
    await waitForHttpHealth("service-agent-python", runtime.serviceAgentPort);
    bus.updateNode("service-agent", { status: "running" }, context.scenarioId);
  }
}

async function startNodesSerially(context: DemoContext, bus: DemoEventBus): Promise<void> {
  for (const nodeRuntime of context.nodes) {
    await startNode(nodeRuntime);
    bus.updateNode(mapRuntimeNameToNodeId(nodeRuntime.name), { status: "running" }, context.scenarioId);
  }
}

async function startNodesInPhases(context: DemoContext, bus: DemoEventBus): Promise<void> {
  const publisherNodes = context.nodes.filter((nodeRuntime) => nodeRuntime.name === "cdn-publisher");
  const infrastructureNodes = context.nodes.filter((nodeRuntime) => nodeRuntime.name !== "cdn-publisher");
  await Promise.all(infrastructureNodes.map((nodeRuntime) => startNodeAndMarkReady(context, bus, nodeRuntime)));
  for (const nodeRuntime of publisherNodes) {
    await startNodeAndMarkReady(context, bus, nodeRuntime);
  }
}

async function startNodeAndMarkReady(context: DemoContext, bus: DemoEventBus, nodeRuntime: DemoContext["nodes"][number]): Promise<void> {
  await startNode(nodeRuntime);
  bus.updateNode(mapRuntimeNameToNodeId(nodeRuntime.name), { status: "running" }, context.scenarioId);
}

async function stopContext(context: DemoContext): Promise<void> {
  if (context.serviceAgent?.pid) stopProcessTree(context.serviceAgent.pid);
  for (const nodeRuntime of [...context.nodes].reverse()) {
    await stopNode(nodeRuntime);
  }
  await stopNats(context.natsRuntime);
}

function mapRuntimeNameToNodeId(name: string): string {
  if (name === "registrar-a") return "registrar-1";
  if (name === "registrar-b") return "registrar-2";
  if (name === "registrar-c") return "registrar-3";
  if (name === "discovery-a") return "discovery-1";
  if (name === "discovery-b") return "discovery-2";
  if (name === "root") return "root";
  if (name === "cdn") return "cdn";
  return name;
}

async function runServiceAgentScenario(context: DemoContext, bus: DemoEventBus): Promise<void> {
  const registrar = loadIdentityMaterial(context.dirs.registrars[0]);
  const resource = createResourceIdentity({
    semanticCode: "AGDM",
    resourceType: "agent_service",
    capabilityTags: ["openagenet.local", "trusted-demo", "domain.demo.commerce"],
    authorizedDomains: ["openagenet.local"],
    serviceEndpoint: `http://127.0.0.1:${runtime.serviceAgentPort}/agent/invoke`,
    label: "Demo Service Agent",
    description: "Service Agent used by the OAN visual demo.",
    protocol: "http",
    serviceType: "AgentService",
    identityType: "service-agent",
    useCaseExamples: ["Discover through two Discovery nodes.", "Exchange VC material and establish a trusted call."],
  });
  persistIdentityMaterial(context.dirs.serviceAgent, resource);
  const registration = buildResourceRegistrationFixture(resource, {
    draftId: "demo-service-agent",
    registrarDid: registrar.did,
    resourceType: "agent_service",
    metadata: {
      name: "Demo Service Agent",
      description: "Visual demo Service Agent registration",
      capabilityTags: ["openagenet.local", "trusted-demo", "domain.demo.commerce"],
      authorizedDomains: ["openagenet.local"],
    },
  });
  const demoResource = toDemoResource(resource.did, "agent_service", "Demo Service Agent", ["openagenet.local", "trusted-demo"], "created");
  bus.upsertResource(demoResource, "resource-created", context.scenarioId, "Service DID Document prepared");
  bus.addArtifact({ id: `${resource.did}:did`, title: "Service Agent DID Document", owner: "service-agent", resourceDid: resource.did, kind: "did-document", value: resource.didDocument });
  bus.addArtifact({ id: `${resource.did}:key`, title: "Service Agent private key", owner: "service-agent", resourceDid: resource.did, kind: "private-key", value: resource.privateKeyJwk, sensitive: true });
  bus.addArtifact({ id: `${resource.did}:registration`, title: "Registrar submission", owner: "registrar-1", resourceDid: resource.did, kind: "registration", value: registration });
  writeResourceArtifact(context, demoResource, "did-document.json", resource.didDocument);
  writeResourceArtifact(context, demoResource, "registration-submission.json", registration);

  const registrarAccepted = [0, 0, 0];
  await registerResource(context, bus, registration, demoResource, 1, 0, registrarAccepted);
  await queryAndConnect(context, bus, demoResource);
}

async function runMixedFourScenario(context: DemoContext, bus: DemoEventBus): Promise<void> {
  const types: ResourceType[] = ["agent_service", "skill", "mcp_server", "tool_api"];
  const resources = types.map((type, index) => createTypedResource(type, index));
  const registrarAccepted = [0, 0, 0];
  for (let index = 0; index < resources.length; index++) {
    const resource = resources[index];
    const registrarIndex = index % context.dirs.registrars.length;
    const registrar = loadIdentityMaterial(context.dirs.registrars[registrarIndex]);
    persistIdentityMaterial(path.join(context.environment.workDir, "data", `resource-${index}`), resource);
    const registration = buildResourceRegistrationFixture(resource, {
      draftId: `demo-${resource.did.slice(-6)}`,
      registrarDid: registrar.did,
      resourceType: resource.didDocument.oanMetadata.resourceType,
      metadata: {
        name: resource.didDocument.oanMetadata.resourceDescription.name,
        description: resource.didDocument.oanMetadata.resourceDescription.description,
        capabilityTags: resource.didDocument.oanMetadata.capabilityTags,
        authorizedDomains: resource.didDocument.oanMetadata.authorizedDomains,
      },
    });
    const demoResource = toDemoResource(
      resource.did,
      resource.didDocument.oanMetadata.resourceType,
      resource.didDocument.oanMetadata.resourceDescription.name,
      resource.didDocument.oanMetadata.capabilityTags,
      "created",
    );
    bus.upsertResource(demoResource, "resource-created", context.scenarioId, `${demoResource.name} DID Document prepared`);
    bus.addArtifact({ id: `${resource.did}:did`, title: `${demoResource.name} DID Document`, owner: `resource-${index}`, resourceDid: resource.did, kind: "did-document", value: resource.didDocument });
    bus.addArtifact({ id: `${resource.did}:key`, title: `${demoResource.name} private key`, owner: `resource-${index}`, resourceDid: resource.did, kind: "private-key", value: resource.privateKeyJwk, sensitive: true });
    bus.addArtifact({ id: `${resource.did}:registration`, title: `${demoResource.name} registrar submission`, owner: `registrar-${registrarIndex + 1}`, resourceDid: resource.did, kind: "registration", value: registration });
    writeResourceArtifact(context, demoResource, "did-document.json", resource.didDocument);
    writeResourceArtifact(context, demoResource, "registration-submission.json", registration);
    await registerResource(context, bus, registration, demoResource, index + 1, registrarIndex, registrarAccepted);
  }
  for (const discoveryPort of runtime.discoveryPorts) {
    const response = await postJson<any>(
      `http://127.0.0.1:${discoveryPort}/discovery/resources/query`,
      { capabilityTags: ["openagenet.local"], limit: 10 },
      { timeoutMs: 60_000 },
    );
    bus.addArtifact({
      id: `discovery-${discoveryPort}:mixed-query`,
      title: `Discovery ${discoveryPort} mixed query response`,
      owner: `discovery-${runtime.discoveryPorts.indexOf(discoveryPort) + 1}`,
      kind: "discovery-response",
      value: response,
    });
    bus.emit({
      kind: "user-discovered",
      scenarioId: context.scenarioId,
      title: `User Agent discovered ${listDiscoveryCandidates(response).length} resources`,
      message: `Discovery port ${discoveryPort}`,
      stats: { discoveryPort, candidates: listDiscoveryCandidates(response) },
    });
  }
}

async function runMixed1000Scenario(context: DemoContext, bus: DemoEventBus): Promise<void> {
  const total = 1000;
  const types: ResourceType[] = ["agent_service", "skill", "mcp_server", "tool_api"];
  bus.emit({ kind: "log", scenarioId: context.scenarioId, title: "Pressure registration started", message: `${total} mixed resources across 3 Registrars` });
  let accepted = 0;
  const registrarAccepted = [0, 0, 0];
  let sampling = true;
  const sampler = samplePressureStats(context, bus, () => accepted, total, registrarAccepted, () => sampling);
  try {
    await runWithConcurrency(Array.from({ length: total }, (_, index) => index), 48, async (index) => {
      const type = types[index % types.length];
      const resource = createTypedResource(type, index);
      const registrarIndex = index % context.dirs.registrars.length;
      const registrar = loadIdentityMaterial(context.dirs.registrars[registrarIndex]);
      const registration = buildResourceRegistrationFixture(resource, {
        draftId: `pressure-${index}`,
        registrarDid: registrar.did,
        resourceType: type,
        metadata: {
          name: `Pressure ${type} ${index}`,
          description: `OAN demo pressure resource ${index}`,
          capabilityTags: ["openagenet.local", "pressure-demo", `resource-${index % 20}`, type],
          authorizedDomains: resource.didDocument.oanMetadata.authorizedDomains,
        },
      });
      await postJson(`http://127.0.0.1:${runtime.registrarPorts[registrarIndex]}/resources/register`, registration, { timeoutMs: 180_000 });
      accepted += 1;
      registrarAccepted[registrarIndex] += 1;
    });
  } finally {
    sampling = false;
    await sampler;
  }
  await waitForPressurePropagation(context, bus, accepted, total, registrarAccepted, 240_000);
  await emitPressureStats(context, bus, total, total, registrarAccepted);
}

async function samplePressureStats(
  context: DemoContext,
  bus: DemoEventBus,
  accepted: () => number,
  total: number,
  registrarAccepted: number[],
  isSampling: () => boolean,
): Promise<void> {
  while (isSampling()) {
    await emitPressureStats(context, bus, accepted(), total, [...registrarAccepted]);
    await sleep(200);
  }
  await emitPressureStats(context, bus, accepted(), total, [...registrarAccepted]);
}

async function waitForPressurePropagation(
  context: DemoContext,
  bus: DemoEventBus,
  accepted: number,
  total: number,
  registrarAccepted: number[],
  timeoutMs: number,
  targets: { root?: boolean; cdn?: boolean; discovery?: boolean } = { root: true, cdn: true, discovery: true },
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const stats = await emitPressureStats(context, bus, accepted, total, registrarAccepted);
    const rootReached = !targets.root || Number(stats.rootLatest) >= total;
    const cdnReached = !targets.cdn || Number(stats.cdnPublished) >= total;
    const discoveryReached = !targets.discovery || (Number(stats.discoveryA) >= total && Number(stats.discoveryB) >= total);
    if (rootReached && cdnReached && discoveryReached) {
      return;
    }
    await sleep(200);
  }
  throw new Error(`Pressure propagation did not reach ${total} resources within ${timeoutMs}ms`);
}

async function registerResource(
  context: DemoContext,
  bus: DemoEventBus,
  registration: any,
  resource: DemoResource,
  expectedCount: number,
  registrarIndex: number,
  registrarAccepted: number[],
): Promise<void> {
  const registrarPort = runtime.registrarPorts[registrarIndex];
  const routedResource = { ...resource, registrarNode: `registrar-${registrarIndex + 1}` };
  bus.upsertResource(withStage(routedResource, "registrar"), "resource-registered", context.scenarioId, `${resource.name} submitted to Registrar ${registrarIndex + 1}`);
  const registrarResponse = await postJson<any>(`http://127.0.0.1:${registrarPort}/resources/register`, registration, { timeoutMs: 120_000 });
  if (registrarResponse?.registrationCredential) {
    if (resource.type === "agent_service" && context.scenarioId === "service-agent") {
      const serviceCredentialDir = path.join(context.dirs.serviceAgent, "credentials");
      ensureDir(serviceCredentialDir);
      writeJson(path.join(serviceCredentialDir, "resource-registration-vc.json"), registrarResponse.registrationCredential);
    }
    bus.addArtifact({
      id: `${resource.did}:registration-vc`,
      title: "Registrar-issued resource registration VC",
      owner: `registrar-${registrarIndex + 1}`,
      resourceDid: resource.did,
      kind: "vc",
      value: registrarResponse.registrationCredential,
    });
    writeResourceArtifact(context, resource, "resource-registration-vc.json", registrarResponse.registrationCredential);
  }
  registrarAccepted[registrarIndex] += 1;
  const accepted = registrarAccepted.reduce((sum, count) => sum + count, 0);
  await waitForPressurePropagation(context, bus, accepted, expectedCount, registrarAccepted, 120_000, { root: true });
  bus.upsertResource(withStage(routedResource, "root"), "root-verified", context.scenarioId, "Root verified and archived resource package");
  const rootPackage = await getJson<any>(`http://127.0.0.1:${runtime.rootPort}/root/resources/${encodeURIComponent(resource.did)}`);
  bus.addArtifact({ id: `${resource.did}:root-package`, title: "Root resource package", owner: "root", resourceDid: resource.did, kind: "package", value: rootPackage });
  writeResourceArtifact(context, resource, "root-resource-package.json", rootPackage);
  await waitForPressurePropagation(context, bus, accepted, expectedCount, registrarAccepted, 120_000, { root: true, cdn: true });
  bus.upsertResource(withStage(routedResource, "cdn"), "cdn-published", context.scenarioId, "CDN published Root-approved package");
  const cdnPackage = await getJson<any>(`http://127.0.0.1:${runtime.cdnPort}/cdn/resources/${encodeURIComponent(resource.did)}`);
  bus.addArtifact({ id: `${resource.did}:cdn-package`, title: "CDN resource package", owner: "cdn", resourceDid: resource.did, kind: "package", value: cdnPackage });
  writeResourceArtifact(context, resource, "cdn-resource-package.json", cdnPackage);
  await waitForPressurePropagation(context, bus, accepted, expectedCount, registrarAccepted, 120_000);
  bus.upsertResource(withStage(routedResource, "discovery"), "discovery-indexed", context.scenarioId, "Both Discovery nodes fetched and indexed the resource");
}

async function queryAndConnect(context: DemoContext, bus: DemoEventBus, resource: DemoResource): Promise<void> {
  const resourceDid = resource.did;
  const discoveryResponses = [];
  for (const discoveryPort of runtime.discoveryPorts) {
    const response = await postJson<any>(
      `http://127.0.0.1:${discoveryPort}/discovery/resources/query`,
      { capabilityTags: ["trusted-demo"], resourceType: "agent_service", protocol: "http", limit: 5 },
      { timeoutMs: 60_000 },
    );
    discoveryResponses.push(response);
    bus.addArtifact({
      id: `${resourceDid}:discovery-${discoveryPort}`,
      title: `Discovery ${discoveryPort} response`,
      owner: `discovery-${runtime.discoveryPorts.indexOf(discoveryPort) + 1}`,
      resourceDid,
      kind: "discovery-response",
      value: response,
    });
    bus.emit({ kind: "user-discovered", scenarioId: context.scenarioId, title: "User Agent discovered Service Agent", resourceDid });
  }
  const invocation = buildTrustedInvocation(context.environment.workDir, resourceDid, discoveryResponses[0]);
  const result = await postJsonAllowFailure(`http://127.0.0.1:${runtime.serviceAgentPort}/agent/invoke`, invocation, 60_000);
  if (result.status !== 200) throw new Error(`Trusted invocation failed: ${JSON.stringify(result.body)}`);
  const serviceDidDocument = readJson(path.join(context.dirs.serviceAgent, "did-document.json"));
  if (!verifySignedValue(result.body, serviceDidDocument)) {
    throw new Error("Service Agent response signature verification failed");
  }
  const serviceRegistrationCredential = result.body?.credentials?.find((credential: any) =>
    Array.isArray(credential?.type)
      ? credential.type.includes("OANResourceRegistrationCredential")
      : credential?.type === "OANResourceRegistrationCredential",
  );
  if (!serviceRegistrationCredential) {
    throw new Error("Service Agent did not return a resource registration VC");
  }
  const cdnPackage = await getJson<any>(`http://127.0.0.1:${runtime.cdnPort}/cdn/resources/${encodeURIComponent(resourceDid)}`);
  verifyServiceRegistrationCredential(serviceRegistrationCredential, cdnPackage, readJson(path.join(context.dirs.registrars[0], "did-document.json")));
  bus.addArtifact({ id: `${resourceDid}:invocation`, title: "Trusted invocation envelope", owner: "user-agent", resourceDid, kind: "vc", value: invocation });
  bus.addArtifact({
    id: `${resourceDid}:exchanged-service-registration-vc`,
    title: "Service Agent exchanged registration VC",
    owner: "service-agent",
    resourceDid,
    kind: "vc",
    value: serviceRegistrationCredential,
  });
  writeResourceArtifact(context, resource, "exchanged-service-registration-vc.json", serviceRegistrationCredential);
  bus.addArtifact({ id: `${resourceDid}:response`, title: "Service Agent signed response", owner: "service-agent", resourceDid, kind: "summary", value: result.body });
  writeResourceArtifact(context, resource, "trusted-invocation-vc-envelope.json", invocation);
  writeResourceArtifact(context, resource, "service-agent-signed-response.json", result.body);
  bus.emit({ kind: "trusted-connected", scenarioId: context.scenarioId, title: "VC exchange verified, business connection established", resourceDid });
}

function verifyServiceRegistrationCredential(credential: any, resourcePackage: any, registrarDidDocument: any): void {
  if (!credentialTypes(credential).has("OANResourceRegistrationCredential")) throw new Error("Invalid service registration VC type");
  if (credential.issuer !== registrarDidDocument.id) throw new Error("Service registration VC issuer mismatch");
  if (!verifySignedValue(credential, registrarDidDocument)) throw new Error("Service registration VC signature invalid");
  if (credential.credentialStatus?.status !== "active") throw new Error("Service registration VC is not active");
  const subject = credential.credentialSubject ?? {};
  const resourceDid = resourcePackage.resourceDid ?? resourcePackage.did;
  if (subject.id !== resourceDid || subject.resourceDid !== resourceDid) throw new Error("Service registration VC subject mismatch");
  if (subject.resourceType !== resourcePackage.resourceType) throw new Error("Service registration VC resource type mismatch");
  const packageDidDocumentHash = stripSha256(resourcePackage.didDocumentHash ?? sha256Canonical(resourcePackage.didDocument ?? {}));
  if (stripSha256(subject.didDocumentHash) !== packageDidDocumentHash) throw new Error("Service registration VC DID Document hash mismatch");
  if (resourcePackage.metadataHash && stripSha256(subject.metadataHash) !== stripSha256(resourcePackage.metadataHash)) {
    throw new Error("Service registration VC metadata hash mismatch");
  }
}

function verifySignedValue(value: any, didDocument: any): boolean {
  const proof = value?.proof;
  if (!proof?.creator || !proof?.proofValue) return false;
  const method = (didDocument.verificationMethod ?? []).find((candidate: any) => candidate.id === proof.creator);
  if (!method?.publicKeyJwk) return false;
  const unsigned = structuredClone(value);
  delete unsigned.proof;
  delete unsigned.proofCreator;
  const suite = String(proof.cryptoSuite ?? method.cryptoSuite ?? "Ed25519Sha256Legacy");
  const input =
    suite === "Ed25519Sha256" || suite === "ed25519-sha256"
      ? Buffer.from(canonicalJson(unsigned), "utf8")
      : Buffer.from(crypto.createHash("sha256").update(canonicalJson(unsigned)).digest("hex"), "utf8");
  const publicKey = crypto.createPublicKey({ key: method.publicKeyJwk, format: "jwk" });
  return crypto.verify(null, input, publicKey, Buffer.from(String(proof.proofValue), "base64url"));
}

function credentialTypes(credential: any): Set<string> {
  if (Array.isArray(credential?.type)) return new Set(credential.type.map(String));
  return credential?.type ? new Set([String(credential.type)]) : new Set();
}

function stripSha256(value: unknown): string {
  const text = String(value ?? "");
  return text.startsWith("sha256:") ? text.slice("sha256:".length) : text;
}

async function emitPressureStats(context: DemoContext, bus: DemoEventBus, accepted: number, total: number, registrarAccepted: number[]): Promise<Record<string, unknown>> {
  let rootStatus: any = {};
  let cdnStatus: any = {};
  let discoveryCounts: number[] = [];
  try {
    rootStatus = await getJson<any>(`http://127.0.0.1:${runtime.rootPort}/root/status`);
    cdnStatus = await getJson<any>(`http://127.0.0.1:${runtime.cdnPort}/cdn/status`);
    discoveryCounts = await Promise.all(
      runtime.discoveryPorts.map(async (port) => {
        const status = await getJson<any>(`http://127.0.0.1:${port}/discovery/index/stats`);
        return Number(status.indexedResourceCount ?? status.indexed_resource_count ?? status.resourceCount ?? 0);
      }),
    );
  } catch {
    // Status endpoints can be momentarily busy during pressure bursts.
  }
  const stats = {
    accepted,
    total,
    registrarAccepted: {
      "registrar-1": registrarAccepted[0] ?? 0,
      "registrar-2": registrarAccepted[1] ?? 0,
      "registrar-3": registrarAccepted[2] ?? 0,
    },
    rootLatest: rootStatus.latestVersionCount ?? 0,
    cdnPublished: cdnStatus.resourceCount ?? 0,
    discoveryA: discoveryCounts[0] ?? 0,
    discoveryB: discoveryCounts[1] ?? 0,
  };
  bus.setStats(stats);
  const discoveryMin = Math.min(stats.discoveryA, stats.discoveryB);
  bus.emit({
    kind: "pressure-progress",
    scenarioId: context.scenarioId,
    title: `Registrar accepted ${accepted}/${total}; Discovery indexed ${discoveryMin}/${total}`,
    message: `Root ${stats.rootLatest}/${total}, CDN ${stats.cdnPublished}/${total}, Discovery 1 ${stats.discoveryA}/${total}, Discovery 2 ${stats.discoveryB}/${total}`,
    stats,
  });
  return stats;
}

function createTypedResource(type: ResourceType, index: number): ReturnType<typeof createResourceIdentity> {
  const semantic = type === "agent_service" ? "AGDM" : type === "skill" ? "SKDM" : type === "mcp_server" ? "MCDM" : "TLDM";
  return createResourceIdentity({
    semanticCode: semantic,
    resourceType: type,
    capabilityTags: ["openagenet.local", "mixed-demo", type, `resource-${index % 12}`],
    authorizedDomains: ["openagenet.local"],
    serviceEndpoint: `http://127.0.0.1:${9600 + index}/resource/${type}`,
    label: `Demo ${type} ${index}`,
    description: `OAN visual demo ${type} resource.`,
    protocol: type === "mcp_server" ? "mcp" : "http",
    serviceType: type === "skill" ? "OANSkillManifest" : type === "mcp_server" ? "OANMCPServer" : type === "tool_api" ? "OANToolAPI" : "AgentService",
    identityType: type,
    useCaseExamples: [`Discover and verify ${type} through OAN.`],
  });
}

function toDemoResource(did: string, type: ResourceType, name: string, tags: string[], stage: DemoResource["stage"]): DemoResource {
  return { did, type, name, tags, stage };
}

function withStage(resource: DemoResource, stage: DemoResource["stage"]): DemoResource {
  return { ...resource, stage };
}

function writeResourceArtifact(context: DemoContext, resource: DemoResource, fileName: string, value: unknown): string {
  const dir = resourceArtifactDir(context, resource);
  const target = path.join(dir, fileName);
  writeJson(target, value);
  return target;
}

function resourceArtifactDir(context: DemoContext, resource: DemoResource): string {
  const didTail = resource.did.split(":").pop()?.slice(-10) ?? "resource";
  const safeName = resource.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "resource";
  const dir = path.join(context.dirs.demoArtifacts, "resources", `${resource.type}-${safeName}-${didTail}`);
  ensureDir(dir);
  return dir;
}

function addNodeArtifacts(bus: DemoEventBus, scenarioId: DemoScenarioId, owner: string, dir: string): void {
  const didPath = path.join(dir, "did-document.json");
  const vcPath = path.join(dir, "root-authorization-vc.json");
  const keyPath = path.join(dir, "private-key.jwk.json");
  if (fs.existsSync(didPath)) {
    const did = readJson<any>(didPath);
    bus.addArtifact({ id: `${owner}:did`, title: `${owner} DID Document`, owner, kind: "did-document", value: did }, scenarioId);
  }
  if (fs.existsSync(vcPath)) {
    bus.addArtifact({ id: `${owner}:vc`, title: `${owner} Root authorization VC`, owner, kind: "vc", value: readJson(vcPath) }, scenarioId);
  }
  if (fs.existsSync(keyPath)) {
    bus.addArtifact({ id: `${owner}:key`, title: `${owner} private key`, owner, kind: "private-key", value: readJson(keyPath), sensitive: true }, scenarioId);
  }
}

function issueUserAgentCredential(userAgentDir: string, registrar: ReturnType<typeof loadIdentityMaterial>): void {
  const userDidDocument = readJson<Record<string, any>>(path.join(userAgentDir, "did-document.json"));
  const issuedAt = "2026-06-04T00:00:00Z";
  const credential = {
    id: "urn:oan:credential:user-agent-registration:genesis-registrar:v1",
    type: "UserAgentRegistrationCredential",
    issuer: registrar.did,
    subject: String(userDidDocument.id),
    status: "active",
    issuedAt,
    expiresAt: null,
    claims: {
      registered: true,
      identityType: "user-agent",
      didDocumentHash: `sha256:${sha256Canonical(userDidDocument)}`,
      capabilityTags:
        userDidDocument.oanMetadata?.resourceDescription?.capabilityTags ??
        userDidDocument.oanMetadata?.agentDescription?.capabilityTags ??
        [],
      allowedInvocation: ["trusted-hello-demo", "trusted-negative-cases"],
    },
    proofCreator: registrar.keyId,
  };
  writeJson(
    path.join(userAgentDir, "credentials", "user-agent-registration.json"),
    signValue(credential, { ...registrar, cryptoSuite: "Ed25519Sha256" }, "assertionMethod"),
  );
}

function mirrorInfrastructureDataForAgents(
  workDir: string,
  dirs: { rootDir: string; registrarDir: string; discoveryDir: string },
): void {
  const dataRoot = path.join(workDir, "data");
  for (const [name, source] of [
    ["root", dirs.rootDir],
    ["registrar", dirs.registrarDir],
    ["discovery", dirs.discoveryDir],
  ] as const) {
    const target = path.join(dataRoot, name);
    resetDir(target);
    copyDir(source, target);
  }
}
