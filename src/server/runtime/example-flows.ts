// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, execSync, spawn } from "node:child_process";
import {
  type BenchmarkEnvironment,
  type IdentityMaterial,
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
  ensureServiceBinaries,
  examplesRoot,
  getJson,
  listDiscoveryCandidates,
  loadIdentityMaterial,
  nowIso,
  persistIdentityMaterial,
  postJson,
  readJson,
  seedRootBulletin,

  userAgentFixtureRoot,
  startNats,
  startNodesInPhases,
  stopNats,
  stopNode,
  uniqueRootEventStreamProfile,
  waitForRootLatestVersionCount,
  workspaceRoot,
  writeBenchmarkCdnConfig,
  writeBenchmarkCdnPublisherConfig,
  writeBenchmarkDiscoveryConfig,
  writeBenchmarkRegistrarConfig,
  writeBenchmarkRootConfig,
  writeGenesisAuthorizationState,
  writeJson,
  writeText,
  resetDir,
  rootFixtureRoot,
} from "./shared.js";

export const agentRoot =
  process.env.OAN_AGENT_PY_ROOT ?? path.join(examplesRoot, "runtime", "agent-py");

export interface SingleNodeRuntime {
  rootPort: number;
  registrarPort: number;
  discoveryPort: number;
  cdnPort: number;
  publisherPort: number;
  natsPort: number;
  serviceAgentPort: number;
}

export interface SingleNodeScenario {
  environment: BenchmarkEnvironment;
  runtime: SingleNodeRuntime;
  identities: {
    root: IdentityMaterial;
    registrar: IdentityMaterial;
    discovery: IdentityMaterial;
  };
  natsRuntime: ReturnType<typeof createNatsRuntime>;
  nodes: ReturnType<typeof createNodeRuntime>[];
  serviceAgent?: any;
}

export interface RegisteredDemoResource {
  resourceDid: string;
  resourceIdentity: IdentityMaterial;
  registration: Record<string, unknown>;
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEqual(name: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`${name} mismatch. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

export function b64url(value: any): string {
  return value.toString("base64url");
}

export function signValue(value: Record<string, any>, identity: IdentityMaterial, proofPurpose = "authentication"): Record<string, any> {
  const unsigned = { ...value };
  delete unsigned.proof;
  delete unsigned.proofCreator;
  const privateKey = crypto.createPrivateKey({ key: identity.privateKeyJwk, format: "jwk" });
  const suite = String(identity.cryptoSuite || "ed25519-sha256");
  const input =
    suite === "Ed25519Sha256" || suite === "ed25519-sha256"
      ? Buffer.from(canonicalJson(unsigned), "utf8")
      : Buffer.from(crypto.createHash("sha256").update(canonicalJson(unsigned)).digest("hex"), "utf8");
  return {
    ...unsigned,
    proof: {
      type: "Ed25519Signature2020",
      creator: identity.keyId,
      created: nowIso(),
      proofPurpose,
      proofValue: b64url(crypto.sign(null, input, privateKey)),
      cryptoSuite: suite,
      hashAlgorithm: "SHA-256",
      verificationMethod: identity.keyId,
    },
  };
}

export function sha256Canonical(value: unknown): string {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function safeRemoveNestedProperty(objectValue: Record<string, any>, dottedPath: string): void {
  const parts = dottedPath.split(".");
  let current: any = objectValue;
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = current?.[parts[index]];
    if (!current || typeof current !== "object") return;
  }
  delete current[parts[parts.length - 1]];
}

export async function postJsonAllowFailure(url: string, body: unknown, timeoutMs = 60_000): Promise<{ status: number; body: any; rawBody: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const rawBody = await response.text();
    return {
      status: response.status,
      rawBody,
      body: rawBody ? JSON.parse(rawBody) : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function waitForRootEventPublish(rootBaseUrl: string, target: number, timeoutMs = 120_000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getJson<any>(`${rootBaseUrl}/root/status`);
    if (Number(status?.eventRuntime?.publish_failure_count ?? 0) > 0) {
      throw new Error(`Root event publication failed: ${JSON.stringify(status.eventRuntime)}`);
    }
    if (Number(status?.eventRuntime?.publish_success_count ?? 0) >= target) {
      return status;
    }
    await sleep(250);
  }
  throw new Error(`Root event publish count did not reach ${target}`);
}

export async function waitForPublisherAck(publisherBaseUrl: string, target: number, timeoutMs = 120_000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getJson<any>(`${publisherBaseUrl}/status`);
    if (Number(status?.runtime?.total_failed_count ?? 0) > 0) {
      throw new Error(`cdn-publisher reported failures: ${JSON.stringify(status.runtime)}`);
    }
    if (Number(status?.runtime?.total_acked_count ?? 0) >= target) {
      return status;
    }
    await sleep(250);
  }
  throw new Error(`cdn-publisher ack count did not reach ${target}`);
}

export async function waitForCdnResourceCount(cdnBaseUrl: string, target: number, timeoutMs = 120_000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getJson<any>(`${cdnBaseUrl}/cdn/status`);
    if (Number(status?.resourceCount ?? 0) >= target) {
      return status;
    }
    await sleep(250);
  }
  throw new Error(`CDN resource count did not reach ${target}`);
}

export async function waitForDiscoveryIndexedCount(discoveryBaseUrl: string, target: number, timeoutMs = 120_000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const stats = await getJson<any>(`${discoveryBaseUrl}/discovery/index/stats`);
    if (Number(stats?.indexedResourceCount ?? stats?.resourceCount ?? 0) >= target) {
      return stats;
    }
    await sleep(250);
  }
  throw new Error(`Discovery indexedResourceCount did not reach ${target}`);
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function defaultSingleNodeRuntime(): SingleNodeRuntime {
  return {
    rootPort: 8000,
    registrarPort: 8001,
    discoveryPort: 8002,
    cdnPort: 8003,
    publisherPort: 8010,
    natsPort: Number.parseInt(process.env.OAN_BENCH_NATS_PORT ?? "4222", 10),
    serviceAgentPort: 9001,
  };
}

export function prepareSingleNodeScenario(name: string, runtime = defaultSingleNodeRuntime()): SingleNodeScenario {
  const environment = createBenchmarkEnvironment(name);
  const eventProfile = uniqueRootEventStreamProfile(environment.runId, runtime.natsPort);
  const natsRuntime = createNatsRuntime(environment.pidDir);
  const configDir = path.join(environment.workDir, "config");
  ensureDir(configDir);

  const rootDir = path.join(environment.workDir, "root");
  const registrarDir = path.join(environment.workDir, "registrar");
  const discoveryDir = path.join(environment.workDir, "discovery");
  const cdnDir = path.join(environment.workDir, "cdn");
  const userAgentDir = path.join(environment.workDir, "data", "user-agent");
  const serviceAgentDir = path.join(environment.workDir, "data", "demo-service-agent");

  const root = copyGenesisNodeIdentity("genesis-root", rootDir, { endpoint: `http://localhost:${runtime.rootPort}` });
  const registrar = copyGenesisNodeIdentity("genesis-registrar-1", registrarDir, { endpoint: `http://localhost:${runtime.registrarPort}` });
  const discovery = copyGenesisNodeIdentity("genesis-discovery-1", discoveryDir, { endpoint: `http://localhost:${runtime.discoveryPort}` });
  seedRootBulletin(rootFixtureRoot, rootDir, { cdnPort: runtime.cdnPort });
  writeGenesisAuthorizationState(rootDir, {
    registrarDirs: [registrarDir],
    discoveryDirs: [discoveryDir],
    authorizedDomains: ["*"],
  });
  writeJson(path.join(rootDir, "request-nonces.json"), { nonces: {} });

  resetDir(path.join(rootDir, "archive"));
  resetDir(path.join(rootDir, "indexes"));
  resetDir(path.join(rootDir, "queues"));
  resetDir(path.join(rootDir, "verified-packages"));
  resetDir(path.join(registrarDir, "drafts"));
  resetDir(path.join(registrarDir, "records"));
  resetDir(path.join(discoveryDir, "index"));
  resetDir(path.join(cdnDir, "documents"));
  resetDir(path.join(cdnDir, "metadata"));
  resetDir(path.join(cdnDir, "packages"));
  resetDir(path.join(cdnDir, "resources"));
  writeJson(path.join(discoveryDir, "index", "capabilities.json"), []);
  writeJson(path.join(cdnDir, "manifest.json"), { version: "0.1.0", generatedAt: nowIso(), rootDid: "", packages: [] });

  mirrorInfrastructureDataForAgents(environment.workDir, { rootDir, registrarDir, discoveryDir });
  copyDir(userAgentFixtureRoot, userAgentDir);
  issueUserAgentCredential(userAgentDir, registrar);
  ensureDir(serviceAgentDir);

  writeBenchmarkRootConfig(path.join(configDir, "root.toml"), runtime, root.did, {
    events: eventProfile,
  });
  writeBenchmarkRegistrarConfig(path.join(configDir, "registrar.toml"), runtime, root.did, "registrar");
  writeBenchmarkDiscoveryConfig(path.join(configDir, "discovery.toml"), runtime, "discovery");
  writeBenchmarkCdnConfig(path.join(configDir, "cdn.toml"), runtime, root.did);
  writeBenchmarkCdnPublisherConfig(path.join(configDir, "cdn-publisher.toml"), runtime, {
    events: eventProfile,
    rootKeysDirRelative: "../root/keys",
  });
  ensurePostgresDatabasesFromConfigs([
    path.join(configDir, "root.toml"),
    path.join(configDir, "registrar.toml"),
    path.join(configDir, "discovery.toml"),
    path.join(configDir, "cdn.toml"),
  ]);

  const nodes = [
    createNodeRuntime(environment.pidDir, "root-node", "root-node", path.join(configDir, "root.toml"), runtime.rootPort),
    createNodeRuntime(environment.pidDir, "registrar-node", "registrar-node", path.join(configDir, "registrar.toml"), runtime.registrarPort),
    createNodeRuntime(environment.pidDir, "discovery-node", "discovery-node", path.join(configDir, "discovery.toml"), runtime.discoveryPort),
    createNodeRuntime(environment.pidDir, "cdn-node", "cdn-node", path.join(configDir, "cdn.toml"), runtime.cdnPort),
    createNodeRuntime(environment.pidDir, "cdn-publisher", "cdn-publisher", path.join(configDir, "cdn-publisher.toml"), runtime.publisherPort),
  ];
  return { environment, runtime, identities: { root, registrar, discovery }, natsRuntime, nodes };
}

export async function startSingleNodeScenario(scenario: SingleNodeScenario, options: { serviceAgent?: boolean } = {}): Promise<void> {
  ensureServiceBinaries(["root-node", "registrar-node", "discovery-node", "cdn-node", "cdn-publisher"]);
  await startNats(scenario.natsRuntime, scenario.runtime.natsPort);
  await startNodesInPhases(scenario.nodes);
  if (options.serviceAgent) {
    scenario.serviceAgent = startPythonAgent(
      "service-agent-python",
      ["run", "--project", "agents/service-agent-python", "python", "-m", "service_agent.main"],
      scenario.environment.pidDir,
      scenario.environment.workDir,
    );
    await waitForHttpHealth("service-agent-python", scenario.runtime.serviceAgentPort);
  }
}

export async function stopSingleNodeScenario(scenario: SingleNodeScenario): Promise<void> {
  if (scenario.serviceAgent?.pid) {
    stopProcessTree(scenario.serviceAgent.pid);
  }
  for (const node of [...scenario.nodes].reverse()) {
    await stopNode(node);
  }
  await stopNats(scenario.natsRuntime);
}

export function startPythonAgent(name: string, args: string[], pidDir: string, dataRoot: string): any {
  ensureDir(pidDir);
  const stdout = fs.openSync(path.join(pidDir, `${name}.out.log`), "w");
  const stderr = fs.openSync(path.join(pidDir, `${name}.err.log`), "w");
  const child = spawn("uv", args, {
    cwd: agentRoot,
    env: { ...process.env, OAN_DATA_ROOT: dataRoot },
    stdio: ["ignore", stdout, stderr],
    windowsHide: true,
    // On Windows, detached console subprocesses can briefly flash a black
    // terminal window even when windowsHide is true. Keep the agent in the
    // current process group and terminate the tree explicitly during cleanup.
    detached: false,
  });
  if (process.platform === "win32") {
    child.unref();
  }
  writeText(path.join(pidDir, `${name}.pid`), String(child.pid ?? ""));
  return child;
}

export function stopProcessTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore", windowsHide: true });
    } catch {
      // ignore cleanup races
    }
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // ignore cleanup races
  }
}

export async function waitForHttpHealth(name: string, port: number, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await getJson(`http://127.0.0.1:${port}/health`);
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`${name} did not become ready on port ${port}`);
}

export function createAndPersistDemoService(workDir: string, endpoint: string, options: { draftId: string; source: string; tags?: string[] }): RegisteredDemoResource {
  const tags = options.tags ?? ["gbt4754-2017.01"];
  const identity = createResourceIdentity({
    semanticCode: "AGDM",
    resourceType: "agent_service",
    capabilityTags: tags,
    serviceEndpoint: endpoint,
    label: "Trusted hello demo Service Agent",
    description: "Service Agent used by OAN trusted invocation examples.",
    protocol: "http",
    serviceType: "AgentService",
    identityType: "service-agent",
    useCaseExamples: [
      "Discover the Service Agent through OAN Discovery.",
      "Verify trusted invocation request and response signatures.",
    ],
  });
  persistIdentityMaterial(path.join(workDir, "data", "demo-service-agent"), identity);
  const registrar = loadIdentityMaterial(path.join(workDir, "registrar"));
  const registration = buildResourceRegistrationFixture(identity, {
    draftId: options.draftId,
    registrarDid: registrar.did,
    resourceType: "agent_service",
    metadata: {
      source: options.source,
      demo: options.draftId,
      capabilityTags: tags,
    },
  }) as unknown as Record<string, unknown>;
  return { resourceDid: identity.did, resourceIdentity: identity, registration };
}

export async function registerAndWaitForDiscovery(
  scenario: SingleNodeScenario,
  registered: RegisteredDemoResource,
  targetCount = 1,
): Promise<any> {
  const registrarResponse = await postJson<any>(
    `http://127.0.0.1:${scenario.runtime.registrarPort}/resources/register`,
    registered.registration,
    { timeoutMs: 120_000 },
  );
  if (registrarResponse?.registrationCredential && registered.registration.resourceType === "agent_service") {
    const credentialsDir = path.join(scenario.environment.workDir, "data", "demo-service-agent", "credentials");
    ensureDir(credentialsDir);
    writeJson(path.join(credentialsDir, "resource-registration-vc.json"), registrarResponse.registrationCredential);
  }
  await waitForRootLatestVersionCount(`http://127.0.0.1:${scenario.runtime.rootPort}`, targetCount, 120_000);
  await waitForRootEventPublish(`http://127.0.0.1:${scenario.runtime.rootPort}`, targetCount, 120_000);
  await waitForPublisherAck(`http://127.0.0.1:${scenario.runtime.publisherPort}`, targetCount, 120_000);
  await waitForCdnResourceCount(`http://127.0.0.1:${scenario.runtime.cdnPort}`, targetCount, 120_000);
  await waitForDiscoveryIndexedCount(`http://127.0.0.1:${scenario.runtime.discoveryPort}`, targetCount, 120_000);
  const visibility = await postJson<any>(
    `http://127.0.0.1:${scenario.runtime.discoveryPort}/discovery/index/resources/visibility`,
    { resourceDids: [registered.resourceDid] },
    { timeoutMs: 60_000 },
  );
  assert(
    Array.isArray(visibility?.visible) && visibility.visible.includes(registered.resourceDid),
    `Discovery visibility API did not report registered resource ${registered.resourceDid}: ${JSON.stringify(visibility)}`,
  );
  return registrarResponse;
}

export async function queryDemoService(discoveryPort: number, tags = ["gbt4754-2017.01"]): Promise<any> {
  const response = await postJson<any>(
    `http://127.0.0.1:${discoveryPort}/discovery/resources/query`,
    {
      capabilityTags: tags,
      resourceType: "agent_service",
      protocol: "http",
      limit: 5,
    },
    { timeoutMs: 60_000 },
  );
  assert(listDiscoveryCandidates(response).length > 0, `Discovery did not return any Service Agent candidates: ${JSON.stringify(response)}`);
  return response;
}

export function buildTrustedInvocation(
  workDir: string,
  targetDid: string,
  discoveryResponse: any,
  options: {
    credentialMode?: string;
    timestampMode?: string;
    bodyMode?: string;
  } = {},
): Record<string, any> {
  const credentialMode = options.credentialMode ?? "valid";
  const timestampMode = options.timestampMode ?? "valid";
  const bodyMode = options.bodyMode ?? "valid";
  const userDir = path.join(workDir, "data", "user-agent");
  const user = loadIdentityMaterial(userDir);
  const body =
    bodyMode === "tampered"
      ? { message: "tampered after signing", purpose: "trusted-invocation-negative-cases" }
      : { message: "hello from OAN example tests", purpose: "trusted-invocation-negative-cases" };
  const timestamp = new Date();
  if (timestampMode === "expired") {
    timestamp.setUTCFullYear(2020);
  }
  const response = structuredClone(discoveryResponse);
  response.candidates = Array.isArray(response.candidates)
    ? response.candidates.filter((candidate: any) => String(candidate?.resourceDid ?? candidate?.did) === targetDid)
    : [];
  const invocation: Record<string, any> = {
    type: "OANTrustedInvocation",
    callerDid: user.did,
    targetDid,
    nonce: b64url(crypto.randomBytes(18)),
    timestamp: timestamp.toISOString(),
    body,
    bodyHash: sha256Canonical(body),
    callerDidDocument: user.didDocument,
    credentials: credentialsForMode(workDir, credentialMode),
    discoveryResponse: response,
  };
  const signed = signValue(invocation, user, "authentication");
  if (bodyMode === "wrong-hash") signed.bodyHash = "00";
  if (bodyMode === "wrong-target") signed.targetDid = "did:oan:AGDM:wrong-target";
  return signed;
}

function credentialsForMode(workDir: string, mode: string): any {
  if (mode === "missing") return [];
  const credentialPath = path.join(workDir, "data", "user-agent", "credentials", "user-agent-registration.json");
  const credential = readJson<any>(credentialPath);
  if (mode === "wrong-subject") credential.subject = "did:oan:AGUS:wrong-subject";
  if (mode === "tampered-signature") credential.proof.proofValue = "invalid-credential-signature";
  if (mode === "invalid-type") credential.type = "UnsupportedCredential";
  return [credential];
}

function issueUserAgentCredential(userAgentDir: string, registrar: IdentityMaterial): void {
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

export function runCommand(command: string, args: string[], cwd: string, env: Record<string, string | undefined> = {}): string {
  const spec = executableSpec(command, args);
  return execFileSync(spec.command, spec.args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

export function runCommandInherit(command: string, args: string[], cwd: string, env: Record<string, string | undefined> = {}): void {
  const spec = executableSpec(command, args);
  execFileSync(spec.command, spec.args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
    windowsHide: true,
  });
}

function executableSpec(command: string, args: string[]): { command: string; args: string[] } {
  if (process.platform === "win32" && command === "npm") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", ["npm", ...args].map(quoteWindowsCmdArg).join(" ")],
    };
  }
  return { command, args };
}

function quoteWindowsCmdArg(value: string): string {
  if (!/[()\s&|<>^"]/.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '\\"')}"`;
}

export function parseLastJsonObject(output: string): any {
  const starts: number[] = [];
  for (let index = 0; index < output.length; index += 1) {
    if (output[index] === "{") starts.push(index);
  }
  for (let index = starts.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(output.slice(starts[index]).trim());
    } catch {
      // keep scanning older JSON candidates
    }
  }
  throw new Error("command output does not contain a parseable JSON object");
}

export function nodeDistScript(scriptName: string): string {
  return path.join(examplesRoot, ".bench-dist", scriptName);
}
