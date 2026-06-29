// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, Boxes, ChevronDown, ChevronRight, Network, Play, ShieldCheck, Zap } from "lucide-react";
import type { DemoArtifact, DemoEvent, DemoNode, DemoResource, DemoScenarioId, DemoSnapshot } from "../shared/types.js";
import oanLogoUrl from "./assets/oan-logo.png";
import oanFrameworkHomeUrl from "./assets/oan-framework-home.svg";
import oanFrameworkHomeCnUrl from "./assets/oan-framework-home-cn.svg";
import brand from "./assets/slogan.json";
import "./styles.css";

type PageId = "home" | "demos";
type Locale = "en" | "zh";

const scenarioLabels: Record<Locale, Record<DemoScenarioId, string>> = {
  en: {
    "authorization-history": "Auth History",
    "service-agent": "One Agent",
    "mixed-four": "Four Resources",
    "mixed-1000": "1000 Mixed",
    "agentic-commerce": "Agentic Commerce",
  },
  zh: {
    "authorization-history": "授权历史",
    "service-agent": "单智能体",
    "mixed-four": "四类资源",
    "mixed-1000": "1000 混合资源",
    "agentic-commerce": "智能体商务",
  },
};

const uiText = {
  en: {
    navHome: "Home",
    navDemos: "Demos",
    language: "Language",
    langEn: "EN",
    langZh: "中文",
    homeTitle: "A trust-governed infrastructure layer for agent resources",
    homeLead:
      "OAN places governance, identity, publication, discovery, and verification into one protocol-neutral infrastructure layer, so heterogeneous agent resources can be exposed with verifiable trust before invocation.",
    homeGovernanceCaption: "Governance-state visibility",
    homeRootCaption: "Verification and operational trust",
    homeRegistrarCaption: "Onboarding and signed submission",
    homeDiscoveryCaption: "Trusted search and signed candidates",
    homeProviderCaption: "Resource providers publish",
    homeConsumerCaption: "Resource consumers verify before use",
    homeAdvantagesTitle: "How the roles work together",
    homeAdvantagesLead: "",
    homeAdvantages: [
      "Governance Layer: defines who may participate in the infrastructure and provides the policy basis for later authorization decisions.",
      "Root Node: turns governed trust into operational trust by authorizing service nodes and controlling what can enter the publishable network path.",
      "Registrar Nodes: handle onboarding for service-side resources, verify submissions, and forward accepted registrations into the Root-controlled flow.",
      "Discovery Nodes: return trusted candidates to consumers, so discovery follows authorized publication rather than self-asserted listing.",
      "Service Agents: publish resources through the governed registration path instead of exposing themselves directly to open discovery.",
      "User Agents: discover first, verify trust context, and invoke only after the infrastructure path has produced credible results.",
    ],
    homePrimary: "Open Demos",
    runningWait: "Running, Wait",
    starting: "Starting",
    launchTopology: "Launching local OAN topology",
    anotherRunning: "Another scenario is already running",
    runRequestFailed: "Run request failed",
    nodes: "Nodes",
    resources: "Resources",
    artifacts: "Artifacts",
    events: "Events",
    accepted: "Accepted",
    ready: "Ready",
    running: "Running",
    startingNodes: "Starting Nodes",
    selectAndRun: "Select a scenario and run it",
    runScenario: "Run",
    runScenarioTitle: "Run selected scenario",
    timeline: "Timeline",
    drawerResources: "Resources",
    drawerArtifacts: "Artifacts",
    drawerDetails: "Details",
    tableName: "Name",
    tableType: "Type",
    tableStage: "Stage",
    tableDid: "DID",
    mixed1000Empty:
      "1000 Mixed shows aggregate pressure counters only; individual resource rows are intentionally not retained.",
    resourcesEmpty: "No resources captured for this scenario yet.",
    artifactsEmpty: "No artifacts captured for this view.",
    detailsPrompt: "Open Resources or Artifacts and select one item to inspect its details.",
    detailResourceDid: "Resource DID Document",
    detailResource: "Resource",
    detailArtifact: "Artifact",
    topologyAria: "OAN demo topology",
    slogan: "Open infrastructure for trusted Agent interconnection",
    termRoot: "Root",
    termRegistrar: "Registrar",
    termDiscovery: "Discovery",
    termCdn: "CDN",
    termServiceAgent: "Service Agent",
    termUserAgent: "User Agent",
    termGovernance: "Onchain Governance",
    trustAnchor: "Trust anchor",
    waitingReplay: "Waiting for replay",
    notGovernedReplay: "Not governed in replay",
    outsideReplay: "Outside chain authorization replay",
  },
  zh: {
    navHome: "首页",
    navDemos: "演示",
    language: "语言",
    langEn: "EN",
    langZh: "中文",
    homeTitle: "面向智能体资源的可信治理基础设施层",
    homeLead:
      "OAN 致力于为智能体互联网构建一层开放、可信、可治理的基础设施底座，将治理、身份、发布、发现与校验统一起来，让异构智能体资源在被连接、被发现、被调用之前，先具备可验证、可审计、可跨域协作的信任基础。",
    homeGovernanceCaption: "治理状态可见",
    homeRootCaption: "校验与运行信任",
    homeRegistrarCaption: "接入与签名提交",
    homeDiscoveryCaption: "可信搜索与签名候选集",
    homeProviderCaption: "资源提供方发布资源",
    homeConsumerCaption: "资源使用前先校验",
    homeAdvantagesTitle: "OAN 优势",
    homeAdvantagesLead:
      "这里将“架构价值”和“差异化价值”合并为一组统一优势，突出 OAN 作为可信资源基础设施层的核心能力。",
    homeAdvantages: [
      "根节点、注册节点和发现节点职责分离，使信任边界清晰且可审计。",
      "先治理，再做基础设施授权，使服务节点生命周期和撤销状态始终可见。",
      "先建立资源身份，再进入目录暴露，减少弱信任目录挂牌行为。",
      "先经根节点接收，再对外发布，使资源曝光建立在校验之后，而不是自我声明之后。",
      "先做校验，再做调用，支持更安全的连接前决策。",
      "支持多运营方和跨域信任协作。",
      "统一覆盖服务智能体、技能、MCP Server 和 Tool/API 资源。",
      "在信任建立后允许原生协议继续运行，而不是强制替换现有协议。",
      "让发现能力始终受授权域和可验证证据约束。",
      "提供面向开放标准的信任层，而不是封闭平台。",
    ],
    homePrimary: "进入演示",
    runningWait: "正在运行，请稍候",
    starting: "启动",
    launchTopology: "正在拉起本地 OAN 拓扑",
    anotherRunning: "已有其它场景正在运行",
    runRequestFailed: "运行请求失败",
    nodes: "节点",
    resources: "资源",
    artifacts: "产物",
    events: "事件",
    accepted: "已接收",
    ready: "就绪",
    running: "运行中",
    startingNodes: "正在启动节点",
    selectAndRun: "请选择一个场景并启动",
    runScenario: "运行",
    runScenarioTitle: "运行所选场景",
    timeline: "时间线",
    drawerResources: "资源",
    drawerArtifacts: "产物",
    drawerDetails: "详情",
    tableName: "名称",
    tableType: "类型",
    tableStage: "阶段",
    tableDid: "DID",
    mixed1000Empty: "1000 Mixed 只展示聚合压测计数器，不保留单条资源明细。",
    resourcesEmpty: "当前场景尚未采集到资源。",
    artifactsEmpty: "当前视图尚未采集到产物。",
    detailsPrompt: "打开“资源”或“产物”，再选择一项查看其详情。",
    detailResourceDid: "资源 DID 文档",
    detailResource: "资源",
    detailArtifact: "产物",
    topologyAria: "OAN 演示拓扑",
    slogan: "可信智能体互联的开放基础设施",
    termRoot: "根节点",
    termRegistrar: "注册节点",
    termDiscovery: "发现节点",
    termCdn: "CDN",
    termServiceAgent: "服务智能体",
    termUserAgent: "用户智能体",
    termGovernance: "链上治理层",
    trustAnchor: "信任锚",
    waitingReplay: "等待回放",
    notGovernedReplay: "不在回放治理范围内",
    outsideReplay: "不在链上授权回放范围内",
  },
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
  const [page, setPage] = useState<PageId>(() => currentPageFromHash());
  const [locale, setLocale] = useState<Locale>("en");
  const [snapshot, setSnapshot] = useState<DemoSnapshot>(initialSnapshot);
  const [selectedDetail, setSelectedDetail] = useState<SelectedDetail | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<DemoScenarioId>("authorization-history");
  const [openDrawer, setOpenDrawer] = useState<"resources" | "artifacts" | "details" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [vcExchangeHolding, setVcExchangeHolding] = useState(false);
  const [vcExchangeStartedAt, setVcExchangeStartedAt] = useState<number | null>(null);
  const [vcExchangeFrameNow, setVcExchangeFrameNow] = useState(0);
  const userSelectedScenario = useRef(false);
  const vcExchangeTimer = useRef<number | null>(null);
  const vcExchangeFrameTimer = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

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
      if (demoEvent.scenarioId === "service-agent" && demoEvent.kind === "trusted-connected") {
        if (vcExchangeTimer.current) window.clearTimeout(vcExchangeTimer.current);
        if (vcExchangeFrameTimer.current) window.clearInterval(vcExchangeFrameTimer.current);
        const startedAt = Date.now();
        setVcExchangeStartedAt(startedAt);
        setVcExchangeFrameNow(startedAt);
        setVcExchangeHolding(true);
        vcExchangeFrameTimer.current = window.setInterval(() => setVcExchangeFrameNow(Date.now()), 33);
        vcExchangeTimer.current = window.setTimeout(() => {
          setVcExchangeHolding(false);
          setVcExchangeFrameNow(startedAt + 3000);
          if (vcExchangeFrameTimer.current) window.clearInterval(vcExchangeFrameTimer.current);
          vcExchangeFrameTimer.current = null;
        }, 3000);
      } else if (demoEvent.kind === "scenario-started") {
        if (vcExchangeTimer.current) window.clearTimeout(vcExchangeTimer.current);
        if (vcExchangeFrameTimer.current) window.clearInterval(vcExchangeFrameTimer.current);
        vcExchangeFrameTimer.current = null;
        setVcExchangeStartedAt(null);
        setVcExchangeHolding(false);
      }
      setSnapshot((current) => reduceEvent(current, demoEvent));
    });
    return () => {
      source.close();
      if (vcExchangeTimer.current) window.clearTimeout(vcExchangeTimer.current);
      if (vcExchangeFrameTimer.current) window.clearInterval(vcExchangeFrameTimer.current);
    };
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

  useEffect(() => {
    const onHashChange = () => setPage(currentPageFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const isBusy = snapshot.running || vcExchangeHolding;
  const t = uiText[locale];
  const vcExchangeElapsedMs = vcExchangeStartedAt === null ? null : Math.max(0, vcExchangeFrameNow - vcExchangeStartedAt);
  const displaySnapshot = useMemo(() => {
    const scenarioSnapshot = resetSnapshotForScenario(snapshot, selectedScenario);
    const heldSnapshot = applyVcExchangePresentationHold(scenarioSnapshot, vcExchangeHolding);
    return localizeSnapshot(heldSnapshot, locale);
  }, [snapshot, selectedScenario, vcExchangeHolding, locale]);
  const graph = useMemo(() => buildGraph(displaySnapshot), [displaySnapshot]);
  const displayArtifacts = displaySnapshot.artifacts;

  async function runScenario() {
    if (isBusy) {
      notifyRunning();
      return;
    }
    if (vcExchangeTimer.current) window.clearTimeout(vcExchangeTimer.current);
    if (vcExchangeFrameTimer.current) window.clearInterval(vcExchangeFrameTimer.current);
    vcExchangeFrameTimer.current = null;
    setVcExchangeStartedAt(null);
    setVcExchangeHolding(false);
    const optimisticEvent: DemoEvent = {
      id: Date.now(),
      at: new Date().toISOString(),
      kind: "scenario-started",
      scenarioId: selectedScenario,
      title: `${t.starting} ${scenarioLabels[locale][selectedScenario]}`,
      message: t.launchTopology,
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
        title: response.status === 409 ? t.anotherRunning : t.runRequestFailed,
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
    if (isBusy) {
      notifyRunning();
      return;
    }
    if (vcExchangeTimer.current) window.clearTimeout(vcExchangeTimer.current);
    if (vcExchangeFrameTimer.current) window.clearInterval(vcExchangeFrameTimer.current);
    vcExchangeFrameTimer.current = null;
    setVcExchangeStartedAt(null);
    setVcExchangeHolding(false);
    userSelectedScenario.current = true;
    setSelectedScenario(nextScenario);
    setSelectedDetail(null);
    setOpenDrawer(null);
  }

  function notifyRunning() {
    setToast(t.runningWait);
    window.setTimeout(() => setToast(null), 1600);
  }

  function navigate(nextPage: PageId) {
    window.location.hash = nextPage === "home" ? "#home" : "#demos";
    setPage(nextPage);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img src={oanLogoUrl} alt={`${brand.abbreviation} logo`} />
          <div>
            <strong>{brand.abbreviation}</strong>
            <h1>{brand.productName}</h1>
            <p>{t.slogan}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <nav className="site-nav" aria-label="Primary">
            <button className={page === "home" ? "active" : ""} onClick={() => navigate("home")}>{t.navHome}</button>
            <button className={page === "demos" ? "active" : ""} onClick={() => navigate("demos")}>{t.navDemos}</button>
          </nav>
          <label className="lang-select" aria-label={t.language}>
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              <option value="en">{t.langEn}</option>
              <option value="zh">{t.langZh}</option>
            </select>
          </label>
        </div>
      </header>
      {toast ? <div className="toast">{toast}</div> : null}

      {page === "home" ? (
        <HomePage locale={locale} onOpenDemos={() => navigate("demos")} />
      ) : (
        <>
          <section className="metrics-strip">
            <Metric icon={<Network />} label={t.nodes} value={displaySnapshot.nodes.length} className="metric-nodes" />
            <Metric icon={<Boxes />} label={t.resources} value={displaySnapshot.resources.length} className="metric-resources" />
            <Metric icon={<ShieldCheck />} label={t.artifacts} value={displaySnapshot.artifacts.length} className="metric-artifacts" />
            <Metric icon={<Activity />} label={t.events} value={displaySnapshot.events.length} className="metric-events" />
            <Metric
              icon={<Zap />}
              label={t.accepted}
              value={String(displaySnapshot.stats.accepted ?? displaySnapshot.stats.rootLatest ?? "-")}
              className="metric-accepted"
            />
            <FlowBanner snapshot={displaySnapshot} labels={{ ready: t.ready, running: t.running, startingNodes: t.startingNodes, empty: t.selectAndRun }} />
            <div className="run-controls run-controls-inline">
              <select
                value={selectedScenario}
                onMouseDown={(event) => {
                  if (isBusy) {
                    event.preventDefault();
                    notifyRunning();
                  }
                }}
                onKeyDown={(event) => {
                  if (isBusy) {
                    event.preventDefault();
                    notifyRunning();
                  }
                }}
                onChange={(event) => changeScenario(event.target.value as DemoScenarioId)}
                aria-disabled={isBusy}
              >
                {Object.entries(scenarioLabels[locale]).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <button onClick={runScenario} aria-disabled={isBusy} aria-label={t.runScenarioTitle} title={t.runScenarioTitle}>
                <Play size={16} />
                {t.runScenario}
              </button>
            </div>
          </section>

          <section className={`workspace scenario-${displaySnapshot.activeScenario ?? "none"}`}>
            <div className={`topology-panel ${displaySnapshot.running ? "is-running" : ""}`}>
              <TopologyGraph graph={graph} snapshot={displaySnapshot} vcExchangeElapsedMs={vcExchangeElapsedMs} ariaLabel={t.topologyAria} />
            </div>

            <aside className="side-panel">
              <h2>{t.timeline}</h2>
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
              <DrawerTab id="resources" openDrawer={openDrawer} setOpenDrawer={setOpenDrawer} label={t.drawerResources} count={displaySnapshot.resources.length} />
              <DrawerTab id="artifacts" openDrawer={openDrawer} setOpenDrawer={setOpenDrawer} label={t.drawerArtifacts} count={displaySnapshot.artifacts.length} />
              <DrawerTab id="details" openDrawer={openDrawer} setOpenDrawer={setOpenDrawer} label={t.drawerDetails} count={selectedDetail ? 1 : 0} />
            </div>

            {openDrawer ? (
              <div className="drawer-content">
                {openDrawer === "resources" ? (
                  <div className="resource-panel">
                    <table>
                      <thead>
                        <tr>
                          <th>{t.tableName}</th>
                          <th>{t.tableType}</th>
                          <th>{t.tableStage}</th>
                          <th>{t.tableDid}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displaySnapshot.resources.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="empty-cell">
                              {displaySnapshot.activeScenario === "mixed-1000" ? t.mixed1000Empty : t.resourcesEmpty}
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
                      {displayArtifacts.length === 0 ? <p className="empty-panel">{t.artifactsEmpty}</p> : null}
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
                    {selectedDetail ? <DetailHeader selectedDetail={selectedDetail} artifacts={displayArtifacts} labels={{ resourceDid: t.detailResourceDid, resource: t.detailResource, artifact: t.detailArtifact }} /> : null}
                    <pre>{selectedDetail ? JSON.stringify(detailValue(selectedDetail, displayArtifacts), null, 2) : t.detailsPrompt}</pre>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </>
      )}
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

function HomePage({ locale, onOpenDemos }: { locale: Locale; onOpenDemos: () => void }) {
  const t = uiText[locale];
  const architectureDiagramUrl = locale === "zh" ? oanFrameworkHomeCnUrl : oanFrameworkHomeUrl;
  return (
    <section className="home-page">
      <div className="home-header">
        <h2>{t.homeTitle}</h2>
        <p>{t.homeLead}</p>
        <div className="home-actions">
          <button className="home-primary" onClick={onOpenDemos}>{t.homePrimary}</button>
        </div>
      </div>
      <section className="home-main-grid">
        <div className="architecture-section">
          <div className="architecture-diagram" aria-label={t.homeTitle}>
            <img src={architectureDiagramUrl} alt={t.homeTitle} className="architecture-diagram-image" />
          </div>
        </div>
        <div className="home-value-grid">
          <article className="home-card">
            <h3>{t.homeAdvantagesTitle}</h3>
            <p>{t.homeAdvantagesLead}</p>
            <ul className="home-advantage-list">
              {t.homeAdvantages.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
        </div>
      </section>
    </section>
  );
}

function currentPageFromHash(): PageId {
  return window.location.hash === "#demos" ? "demos" : "home";
}

function localizeSnapshot(snapshot: DemoSnapshot, locale: Locale): DemoSnapshot {
  const t = uiText[locale];
  return {
    ...snapshot,
    stats: { ...snapshot.stats, __locale: locale },
    resources: snapshot.resources.map((resource) => ({
      ...resource,
      name: localizedResourceName(resource.name, locale),
    })),
    artifacts: snapshot.artifacts.map((artifact) => ({
      ...artifact,
      title: localizedArtifactTitle(artifact.title, locale),
    })),
    events: snapshot.events.map((event) => ({
      ...event,
      title: localizedEventText(event.title, locale),
      message: event.message ? localizedEventText(event.message, locale) : event.message,
    })),
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      label: localizedNodeLabel(node.id, locale, node.label),
      endpoint:
        node.endpoint === "Trust anchor"
          ? t.trustAnchor
          : node.endpoint === "Not governed in replay"
            ? t.notGovernedReplay
            : node.endpoint,
      authorizationNote:
        node.authorizationNote === "Waiting for replay"
          ? t.waitingReplay
          : node.authorizationNote === "Outside chain authorization replay"
            ? t.outsideReplay
            : node.authorizationNote,
    })),
  };
}

function localizedNodeLabel(nodeId: string, locale: Locale, fallback?: string): string {
  const t = uiText[locale];
  if (nodeId === "root") return t.termRoot;
  if (nodeId === "cdn") return t.termCdn;
  if (nodeId === "service-agent") return t.termServiceAgent;
  if (nodeId === "user-agent") return t.termUserAgent;
  if (nodeId === "onchain-governance") return t.termGovernance;
  if (nodeId.startsWith("registrar-")) {
    return `${t.termRegistrar} ${nodeId.split("-")[1] ?? ""}`.trim();
  }
  if (nodeId.startsWith("discovery-")) {
    return `${t.termDiscovery} ${nodeId.split("-")[1] ?? ""}`.trim();
  }
  if (locale === "zh") {
    const commerceLabels: Record<string, string> = {
      "commerce-user": "用户智能体",
      "commerce-platform": "平台智能体",
      "commerce-merchant-a": "商家智能体",
      "commerce-payment": "支付智能体",
      "commerce-logistics": "物流智能体",
    };
    if (commerceLabels[nodeId]) return commerceLabels[nodeId];
  }
  return fallback ?? nodeId;
}

function localizedResourceName(name: string, locale: Locale): string {
  if (locale !== "zh") return name;
  const labels: Record<string, string> = {
    "Platform Agent": "平台智能体",
    "Merchant Agent": "商家智能体",
    "Payment Agent": "支付智能体",
    "Logistics Agent": "物流智能体",
  };
  return labels[name] ?? name;
}

function localizedArtifactTitle(title: string, locale: Locale): string {
  if (locale !== "zh") return title;
  const labels: Record<string, string> = {
    "User buying intent": "用户购买意图",
    "Trusted discovery candidate": "可信发现候选",
    "Verified agent session": "已验证智能体会话",
    "Shopping brief": "购物需求简报",
    "Merchant quote": "商家报价",
    "Order draft": "订单草案",
    "Payment confirmation": "支付确认",
    "Logistics commitment": "物流承诺",
    "Trusted commerce receipt": "可信交易凭据",
    "Platform Agent DID Document": "平台智能体 DID 文档",
    "Merchant Agent DID Document": "商家智能体 DID 文档",
    "Payment Agent DID Document": "支付智能体 DID 文档",
    "Logistics Agent DID Document": "物流智能体 DID 文档",
  };
  return labels[title] ?? title;
}

function localizedEventText(text: string, locale: Locale): string {
  if (locale !== "zh") return text;
  const labels: Record<string, string> = {
    "Agentic Commerce: e-commerce to intelligent economy": "智能体商务：从电商经济到智能经济",
    "Preparing local OAN topology": "正在准备本地 OAN 拓扑",
    "Topology ready": "拓扑就绪",
    "9 local demo nodes prepared": "9 个本地演示节点已准备",
    "User buying intent captured": "用户购买意图已采集",
    "Platform Agent DID Document prepared": "平台智能体 DID 文档已准备",
    "Merchant Agent DID Document prepared": "商家智能体 DID 文档已准备",
    "Payment Agent DID Document prepared": "支付智能体 DID 文档已准备",
    "Logistics Agent DID Document prepared": "物流智能体 DID 文档已准备",
    "Platform Agent DID Document captured": "平台智能体 DID 文档已采集",
    "Merchant Agent DID Document captured": "商家智能体 DID 文档已采集",
    "Payment Agent DID Document captured": "支付智能体 DID 文档已采集",
    "Logistics Agent DID Document captured": "物流智能体 DID 文档已采集",
    "Platform Agent submitted to Registrar": "平台智能体已提交到注册节点",
    "Merchant Agent submitted to Registrar": "商家智能体已提交到注册节点",
    "Payment Agent submitted to Registrar": "支付智能体已提交到注册节点",
    "Logistics Agent submitted to Registrar": "物流智能体已提交到注册节点",
    "Business service resource accepted by the governed registration path.": "业务服务资源已被受治理的注册路径接收。",
    "Root accepted commerce agent resources": "根节点已接收商务智能体资源",
    "Platform, merchant, payment, logistics, and after-sales capability are approved for trusted discovery.": "平台、商家、支付、物流及售后能力已通过可信发现所需的校验。",
    "CDN published commerce resource packages": "CDN 已发布商务资源包",
    "Root-approved resource packages are available for Discovery nodes.": "根节点批准的资源包已可供发现节点获取。",
    "Discovery indexed commerce agents": "发现节点已索引商务智能体",
    "User Agent can now search trusted commerce capabilities.": "用户智能体现在可以搜索可信商务能力。",
    "Trusted discovery candidate captured": "可信发现候选已采集",
    "User Agent selects trusted Platform Agent": "用户智能体选择可信平台智能体",
    "Discovery returns a Root-approved candidate with DID Document hash and capability tags.": "发现节点返回经过根节点批准、带 DID 文档哈希和能力标签的候选智能体。",
    "Verified agent session captured": "已验证智能体会话已采集",
    "User and Platform exchange trust material": "用户与平台交换信任材料",
    "Both sides exchange DID Documents and VCs, verify signatures, and establish a trusted session.": "双方交换 DID 文档和 VC，验证签名，并建立可信会话。",
    "Shopping brief captured": "购物需求简报已采集",
    "User Agent expresses purchase intent": "用户智能体表达购买意图",
    "The verified session carries an intent token: business laptop under CNY 8,000.": "已验证会话承载购买意图令牌：8000 元以内的商务轻薄笔记本。",
    "Merchant quote captured": "商家报价已采集",
    "Platform Agent asks Merchant for a quote": "平台智能体向商家询价",
    "Merchant Agent returns signed price, stock, invoice, delivery, and after-sales commitments.": "商家智能体返回已签名的价格、库存、发票、交付和售后承诺。",
    "Order draft captured": "订单草案已采集",
    "User Agent accepts Merchant offer": "用户智能体接受商家报价",
    "The offer satisfies budget, delivery, invoice, and after-sales constraints.": "该报价满足预算、交付、发票和售后约束。",
    "Payment confirmation captured": "支付确认已采集",
    "Payment Agent authorizes payment": "支付智能体授权支付",
    "Payment confirmation is returned after VC verification.": "VC 验证通过后返回支付确认。",
    "Logistics commitment captured": "物流承诺已采集",
    "Merchant Agent books logistics": "商家智能体预约物流",
    "Logistics Agent commits 36-hour delivery with signed tracking data.": "物流智能体承诺 36 小时送达，并返回已签名的跟踪数据。",
    "Trusted commerce receipt captured": "可信交易凭据已采集",
    "Merchant Agent keeps after-sales context": "商家智能体维护售后上下文",
    "Warranty, invoice, and service context stay bound to the trusted order envelope.": "质保、发票和服务上下文绑定在可信订单信封中。",
    "Trusted business connection completed": "可信业务连接已完成",
    "User intent was fulfilled by verified commerce agents across platform, merchant, payment, logistics, and after-sales capabilities.": "用户意图已由平台、商家、支付、物流及售后能力组成的可信智能体链路完成。",
    "Scenario completed": "场景完成",
    "Agentic commerce flow completed": "智能体商务流程已完成",
  };
  return labels[text] ?? text;
}

function DetailHeader({
  selectedDetail,
  artifacts,
  labels,
}: {
  selectedDetail: SelectedDetail;
  artifacts: DemoArtifact[];
  labels: { resourceDid: string; resource: string; artifact: string };
}) {
  if (selectedDetail.kind === "resource") {
    const didDocument = findResourceDidDocument(selectedDetail.resource, artifacts);
    return (
      <div className="detail-header">
        <span>{didDocument ? labels.resourceDid : labels.resource}</span>
        <strong>{selectedDetail.resource.name}</strong>
        <small>{selectedDetail.resource.did}</small>
      </div>
    );
  }
  return (
    <div className="detail-header">
      <span>{labels.artifact}</span>
      <strong>{selectedDetail.artifact.title}</strong>
      <small>{selectedDetail.artifact.kind}{selectedDetail.artifact.resourceDid ? ` / ${selectedDetail.artifact.resourceDid}` : ""}</small>
    </div>
  );
}

function detailValue(selectedDetail: SelectedDetail, artifacts: DemoArtifact[]): unknown {
  if (selectedDetail.kind === "resource") {
    return findResourceDidDocument(selectedDetail.resource, artifacts)?.value ?? selectedDetail.resource;
  }
  return selectedDetail.artifact.value;
}

function findResourceDidDocument(resource: DemoResource, artifacts: DemoArtifact[]): DemoArtifact | undefined {
  return artifacts.find((artifact) => artifact.kind === "did-document" && artifact.resourceDid === resource.did);
}

interface GraphNodeView {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
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
  authorization?: boolean;
}

interface GraphEdgeOptions {
  id?: string;
  variant?: "trust" | "authorization";
  sourcePort?: GraphEdgeView["sourcePort"];
  targetPort?: GraphEdgeView["targetPort"];
}

function TopologyGraph({
  graph,
  snapshot,
  vcExchangeElapsedMs,
  ariaLabel,
}: {
  graph: { nodes: GraphNodeView[]; edges: GraphEdgeView[]; verticalOffsetPx: number };
  snapshot: DemoSnapshot;
  vcExchangeElapsedMs: number | null;
  ariaLabel: string;
}) {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const baseEdges = graph.edges.filter((edge) => !edge.authorization);
  const authorizationEdges = graph.edges.filter((edge) => edge.authorization);
  const renderEdge = (edge: GraphEdgeView) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) return null;
    const path = edgePath(source, target, edge);
    const labelPoint = edgeLabelPoint(source, target, edge);
    return (
      <g
        key={edge.id}
        className={`topology-edge ${edge.active ? "edge-active" : ""} ${edge.done ? "edge-done" : ""} ${edge.trust ? "edge-trust" : ""} ${edge.authorization ? "edge-authorization" : ""}`}
        data-edge-id={edge.id}
      >
        <title>{edge.id}</title>
        <path d={path} markerEnd={edge.trust && !edge.active && !edge.done ? undefined : `url(#${edge.active ? "arrow-active" : edge.done ? "arrow-done" : "arrow-default"})`} />
        {edge.label ? (
          <text x={labelPoint.x} y={labelPoint.y}>
            {edge.label}
          </text>
        ) : null}
      </g>
    );
  };
  const viewBox = snapshot.activeScenario === "agentic-commerce" ? "-160 -90 1570 680" : "0 -90 1250 680";
  return (
    <svg className={`topology-svg scenario-${snapshot.activeScenario ?? "none"}`} viewBox={viewBox} role="img" aria-label={ariaLabel}>
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
      <g className="topology-scene" style={{ transform: `translateY(${graph.verticalOffsetPx}px)` }}>
        <g className="topology-edges">
          {baseEdges.map(renderEdge)}
        </g>
        <g className="topology-nodes">
          {graph.nodes.map((item) => (
            <foreignObject key={item.id} x={item.x} y={item.y} width={item.width ?? 180} height={item.height ?? 124} className="topology-node">
              <div className={`graph-node graph-${item.node.kind} status-${item.node.status ?? "idle"} ${item.node.authorizationStatus ? `auth-${item.node.authorizationStatus}` : ""} ${item.active ? "status-active" : ""}`}>
                <strong>
                  {item.node.label}
                  {item.active ? <i /> : null}
                </strong>
                {item.node.kind === "governance" ? null : (
                  <>
                    <span>{item.node.did ? shortDid(item.node.did) : item.node.endpoint ?? item.node.kind}</span>
                    {item.node.domains?.length ? <small>{item.node.domains.join(", ")}</small> : null}
                    {item.node.authorizationStatus ? <small className="auth-state">{item.node.authorizationStatus}</small> : null}
                    {item.node.authorizationNote ? <small>{item.node.authorizationNote}</small> : null}
                    {item.resourceText ? <em>{item.resourceText}</em> : null}
                  </>
                )}
              </div>
            </foreignObject>
          ))}
        </g>
        <g className="topology-authorization-edges">
          {authorizationEdges.map(renderEdge)}
        </g>
        <g className="topology-handles">
          {graph.edges.flatMap((edge) => {
            if (edge.authorization) return [];
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
        <VcExchangeAnimation graph={graph} snapshot={snapshot} elapsedMs={vcExchangeElapsedMs} />
      </g>
    </svg>
  );
}

function VcExchangeAnimation({ graph, snapshot, elapsedMs }: { graph: { nodes: GraphNodeView[] }; snapshot: DemoSnapshot; elapsedMs: number | null }) {
  const trustedEvent = [...snapshot.events].reverse().find((event) => event.kind === "trusted-connected");
  if (snapshot.activeScenario !== "service-agent" || !trustedEvent || elapsedMs === null) return null;
  const service = graph.nodes.find((node) => node.id === "service-agent");
  const user = graph.nodes.find((node) => node.id === "user-agent");
  if (!service || !user) return null;
  const serviceSlots = vcBadgeSlots(service);
  const userSlots = vcBadgeSlots(user);
  const shouldRenderCopies = elapsedMs >= 1000;
  const moveProgress = Math.max(0, Math.min(1, (elapsedMs - 1000) / 1000));
  const serviceCopy = lerpPoint(serviceSlots.own, userSlots.incoming, moveProgress);
  const userCopy = lerpPoint(userSlots.own, serviceSlots.incoming, moveProgress);
  return (
    <g className="vc-exchange-layer" aria-label="VC exchange animation">
      <VcBadge x={serviceSlots.own.x} y={serviceSlots.own.y} className="vc-badge-service" />
      <VcBadge x={userSlots.own.x} y={userSlots.own.y} className="vc-badge-user" />
      {shouldRenderCopies ? (
        <>
          <VcBadge x={serviceCopy.x} y={serviceCopy.y} className="vc-badge-service vc-badge-copy" />
          <VcBadge x={userCopy.x} y={userCopy.y} className="vc-badge-user vc-badge-copy" />
        </>
      ) : null}
    </g>
  );
}

function VcBadge({ x, y, className }: { x: number; y: number; className: string }) {
  return (
    <g className={`vc-badge ${className}`} transform={`translate(${x} ${y})`}>
      <rect width="28" height="24" rx="5" />
      <text x="14" y="16">
        vc
      </text>
    </g>
  );
}

function lerpPoint(from: { x: number; y: number }, to: { x: number; y: number }, progress: number): { x: number; y: number } {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

function vcBadgeSlots(node: GraphNodeView): { own: { x: number; y: number }; incoming: { x: number; y: number } } {
  const width = node.width ?? 180;
  const visibleHeight = node.node.kind === "service-agent" || node.node.kind === "user-agent" ? 59 : node.height ? Math.min(node.height, 92) : 92;
  const badgeWidth = 28;
  const gap = 6;
  const left = node.x + width / 2 - badgeWidth - gap / 2;
  const right = left + badgeWidth + gap;
  const y = node.y + visibleHeight + 4;
  if (node.id === "user-agent") {
    return { own: { x: right, y }, incoming: { x: left, y } };
  }
  return { own: { x: left, y }, incoming: { x: right, y } };
}

function edgePath(source: GraphNodeView, target: GraphNodeView, edge: GraphEdgeView): string {
  const curve = edgeCurve(source, target, edge);
  if (curve.line) return `M ${curve.a.x} ${curve.a.y} L ${curve.b.x} ${curve.b.y}`;
  return `M ${curve.a.x} ${curve.a.y} C ${curve.c1.x} ${curve.c1.y}, ${curve.c2.x} ${curve.c2.y}, ${curve.b.x} ${curve.b.y}`;
}

function edgeCurve(source: GraphNodeView, target: GraphNodeView, edge: GraphEdgeView): { a: { x: number; y: number }; b: { x: number; y: number }; c1: { x: number; y: number }; c2: { x: number; y: number }; line: boolean } {
  const a = portPoint(source, edge.sourcePort);
  const b = portPoint(target, edge.targetPort);
  if (edge.sourcePort === "bottom" && edge.targetPort === "top") {
    return { a, b, c1: a, c2: b, line: true };
  }
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const tension = edge.curved ? Math.min(110, Math.max(42, distance * 0.25)) : Math.min(120, Math.max(24, distance * 0.42));
  const controlTension = facingHorizontalPorts(edge, a, b) ? Math.min(tension, Math.max(18, Math.abs(b.x - a.x) * 0.45)) : tension;
  const sourceVector = portVector(edge.sourcePort);
  const targetVector = portVector(edge.targetPort);
  const c1 = { x: a.x + sourceVector.x * controlTension, y: a.y + sourceVector.y * controlTension };
  const c2 = { x: b.x + targetVector.x * controlTension, y: b.y + targetVector.y * controlTension };
  return { a, b, c1, c2, line: false };
}

function facingHorizontalPorts(edge: GraphEdgeView, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return (
    (edge.sourcePort === "right" && edge.targetPort === "left" && b.x > a.x) ||
    (edge.sourcePort === "left" && edge.targetPort === "right" && b.x < a.x)
  );
}

function portVector(port: GraphEdgeView["sourcePort"]): { x: number; y: number } {
  if (port === "left") return { x: -1, y: 0 };
  if (port === "right") return { x: 1, y: 0 };
  if (port === "top") return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

function edgeLabelPoint(source: GraphNodeView, target: GraphNodeView, edge: GraphEdgeView): { x: number; y: number } {
  const curve = edgeCurve(source, target, edge);
  if (curve.line) return { x: (curve.a.x + curve.b.x) / 2, y: (curve.a.y + curve.b.y) / 2 - 8 };
  const point = cubicBezierPoint(curve.a, curve.c1, curve.c2, curve.b, 0.5);
  return { x: point.x, y: point.y - 8 };
}

function cubicBezierPoint(a: { x: number; y: number }, c1: { x: number; y: number }, c2: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt ** 3 * a.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * b.x,
    y: mt ** 3 * a.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * b.y,
  };
}

function portPoint(node: GraphNodeView, port: GraphEdgeView["sourcePort"]): { x: number; y: number } {
  const width = node.width ?? 180;
  const height = node.height ? Math.min(node.height, 92) : 92;
  const offset = 8;
  if (port === "left") return { x: node.x - offset, y: node.y + height / 2 };
  if (port === "right") return { x: node.x + width + offset, y: node.y + height / 2 };
  if (port === "top") return { x: node.x + width / 2, y: node.y - offset };
  return { x: node.x + width / 2, y: node.y + height + offset };
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
    nodes: mergeTopologyNodes(current.nodes, incoming.nodes, incoming.running, incoming.activeScenario),
  });
}

function resetSnapshotForScenario(snapshot: DemoSnapshot, selectedScenario: DemoScenarioId, force = false): DemoSnapshot {
  if (!force && (snapshot.running || snapshot.activeScenario === selectedScenario || !snapshot.activeScenario)) return snapshot;
  return normalizeSnapshot({
    ...snapshot,
    running: false,
    activeScenario: selectedScenario,
    nodes: topologyBaseNodes(selectedScenario).map((node) => ({ ...node, status: "idle" })),
    resources: [],
    artifacts: [],
    events: [],
    stats: {},
  });
}

function applyVcExchangePresentationHold(snapshot: DemoSnapshot, holding: boolean): DemoSnapshot {
  if (!holding || snapshot.activeScenario !== "service-agent") return snapshot;
  return {
    ...snapshot,
    running: true,
    events: snapshot.events.filter((event) => event.kind !== "scenario-completed"),
  };
}

function normalizeSnapshot(snapshot: DemoSnapshot): DemoSnapshot {
  return {
    ...snapshot,
    nodes: mergeTopologyNodes(topologyBaseNodes(snapshot.activeScenario), snapshot.nodes, snapshot.running, snapshot.activeScenario),
  };
}

function mergeTopologyNodes(baseNodes: DemoNode[], incomingNodes: DemoNode[], running = false, scenarioId?: DemoScenarioId): DemoNode[] {
  const topologyNodes = topologyBaseNodes(scenarioId);
  const byId = new Map(topologyNodes.map((node) => [node.id, node]));
  for (const node of baseNodes) byId.set(node.id, { ...byId.get(node.id), ...node });
  for (const node of incomingNodes) byId.set(node.id, { ...byId.get(node.id), ...node });
  return topologyNodes.map((node) => {
    const merged = byId.get(node.id) ?? node;
    return {
      ...node,
      ...merged,
      status: merged.status ?? (running ? "starting" : "idle"),
    };
  });
}

function topologyBaseNodes(scenarioId?: DemoScenarioId): DemoNode[] {
  if (scenarioId === "authorization-history") return authorizationTopologyNodes();
  if (scenarioId === "agentic-commerce") return commerceTopologyNodes();
  return defaultTopologyNodes();
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
      domains: ["*"],
      status: "idle",
    },
    {
      id: "discovery-2",
      label: "Discovery 2",
      kind: "discovery",
      endpoint: "http://127.0.0.1:8507",
      domains: ["*"],
      status: "idle",
    },
    { id: "service-agent", label: "Service Agent", kind: "service-agent", endpoint: "http://127.0.0.1:9001", status: "idle" },
    { id: "user-agent", label: "User Agent", kind: "user-agent", status: "idle" },
  ];
}

function commerceTopologyNodes(): DemoNode[] {
  return [
    { id: "root", label: "Root", kind: "root", endpoint: "demo://root", status: "idle" },
    { id: "registrar-1", label: "Registrar", kind: "registrar", endpoint: "demo://registrar", status: "idle" },
    { id: "cdn", label: "CDN", kind: "cdn", endpoint: "demo://cdn", status: "idle" },
    {
      id: "discovery-1",
      label: "Discovery",
      kind: "discovery",
      endpoint: "demo://discovery",
      domains: ["*"],
      status: "idle",
    },
    { id: "commerce-user", label: "User Agent", kind: "user-agent", status: "idle" },
    { id: "commerce-platform", label: "Platform Agent", kind: "commerce-agent", endpoint: "marketplace / recommendation", status: "idle" },
    { id: "commerce-merchant-a", label: "Merchant Agent", kind: "commerce-agent", endpoint: "merchant / inventory / after-sales", status: "idle" },
    { id: "commerce-payment", label: "Payment Agent", kind: "commerce-agent", endpoint: "payment / settlement", status: "idle" },
    { id: "commerce-logistics", label: "Logistics Agent", kind: "commerce-agent", endpoint: "logistics / delivery", status: "idle" },
  ];
}

function authorizationTopologyNodes(): DemoNode[] {
  return [
    { id: "onchain-governance", label: "Onchain Governance", kind: "governance", status: "running" },
    { id: "root", label: "Root", kind: "root", endpoint: "Trust anchor", status: "idle", authorizationStatus: "unauthorized", authorizationNote: "Waiting for replay" },
    { id: "registrar-1", label: "Registrar 1", kind: "registrar", endpoint: "genesis-registrar-1", status: "idle", authorizationStatus: "unauthorized", authorizationNote: "Waiting for replay" },
    { id: "registrar-2", label: "Registrar 2", kind: "registrar", endpoint: "genesis-registrar-2", status: "idle", authorizationStatus: "unauthorized", authorizationNote: "Waiting for replay" },
    { id: "registrar-3", label: "Registrar 3", kind: "registrar", endpoint: "genesis-registrar-3", status: "idle", authorizationStatus: "unauthorized", authorizationNote: "Waiting for replay" },
    { id: "cdn", label: "CDN", kind: "cdn", endpoint: "Not governed in replay", status: "idle", authorizationNote: "Outside chain authorization replay" },
    {
      id: "discovery-1",
      label: "Discovery 1",
      kind: "discovery",
      endpoint: "genesis-discovery-1",
      domains: ["*"],
      status: "idle",
      authorizationStatus: "unauthorized",
      authorizationNote: "Waiting for replay",
    },
    {
      id: "discovery-2",
      label: "Discovery 2",
      kind: "discovery",
      endpoint: "genesis-discovery-2",
      domains: ["*"],
      status: "idle",
      authorizationStatus: "unauthorized",
      authorizationNote: "Waiting for replay",
    },
    { id: "service-agent", label: "Service Agent", kind: "service-agent", endpoint: "Not governed in replay", status: "idle", authorizationNote: "Outside chain authorization replay" },
    { id: "user-agent", label: "User Agent", kind: "user-agent", status: "idle", authorizationNote: "Outside chain authorization replay" },
  ];
}

function reduceEvent(snapshot: DemoSnapshot, event: DemoEvent): DemoSnapshot {
  let nodes = normalizeSnapshot(snapshot).nodes;
  if (event.nodes) nodes = mergeTopologyNodes(nodes, event.nodes, snapshot.running, event.scenarioId ?? snapshot.activeScenario);
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

function buildGraph(snapshot: DemoSnapshot): { nodes: GraphNodeView[]; edges: GraphEdgeView[]; verticalOffsetPx: number } {
  if (snapshot.activeScenario === "agentic-commerce") return buildCommerceGraph(snapshot);

  const positions: Record<string, { x: number; y: number }> = {
    "onchain-governance": { x: 185, y: -66 },
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
  const sizes: Record<string, { width: number; height: number }> = {
    "onchain-governance": { width: 720, height: 48 },
  };
  const nodes = snapshot.nodes.map((node) => ({
    id: node.id,
    x: positions[node.id]?.x ?? 0,
    y: adjustedTopologyY(node.id, positions[node.id]?.y ?? 0, snapshot.activeScenario),
    width: sizes[node.id]?.width,
    height: sizes[node.id]?.height,
    node,
    active: activeNodes.has(node.id),
    resourceText: resourcesByNode[node.id],
  }));
  const isAuthorizationHistory = snapshot.activeScenario === "authorization-history";
  const agentEdgeOptions: GraphEdgeOptions | undefined = isAuthorizationHistory ? { variant: "trust" } : undefined;
  const registrarRootEdges = isAuthorizationHistory
    ? [
        edge("root", "registrar-1", activeEdges, doneEdges, edgeLabel(snapshot, "registrar-1-root"), { id: "registrar-1-root", variant: "authorization", sourcePort: "left", targetPort: "right" }),
        edge("root", "registrar-2", activeEdges, doneEdges, edgeLabel(snapshot, "registrar-2-root"), { id: "registrar-2-root", variant: "authorization", sourcePort: "left", targetPort: "right" }),
        edge("root", "registrar-3", activeEdges, doneEdges, edgeLabel(snapshot, "registrar-3-root"), { id: "registrar-3-root", variant: "authorization", sourcePort: "left", targetPort: "right" }),
      ]
    : [
        edge("registrar-1", "root", activeEdges, doneEdges, edgeLabel(snapshot, "registrar-1-root")),
        edge("registrar-2", "root", activeEdges, doneEdges, edgeLabel(snapshot, "registrar-2-root")),
        edge("registrar-3", "root", activeEdges, doneEdges, edgeLabel(snapshot, "registrar-3-root")),
      ];
  const edges: GraphEdgeView[] = [
    edge("service-agent", "registrar-1", activeEdges, doneEdges, edgeLabel(snapshot, "service-agent-registrar-1"), agentEdgeOptions),
    edge("service-agent", "registrar-2", activeEdges, doneEdges, edgeLabel(snapshot, "service-agent-registrar-2"), agentEdgeOptions),
    edge("service-agent", "registrar-3", activeEdges, doneEdges, edgeLabel(snapshot, "service-agent-registrar-3"), agentEdgeOptions),
    ...registrarRootEdges,
    edge("root", "cdn", activeEdges, doneEdges, edgeLabel(snapshot, "root-cdn")),
    edge("root", "discovery-1", activeEdges, doneEdges, edgeLabel(snapshot, "root-discovery-1")),
    edge("root", "discovery-2", activeEdges, doneEdges, edgeLabel(snapshot, "root-discovery-2")),
    edge("cdn", "discovery-1", activeEdges, doneEdges, edgeLabel(snapshot, "cdn-discovery-1")),
    edge("cdn", "discovery-2", activeEdges, doneEdges, edgeLabel(snapshot, "cdn-discovery-2")),
    edge("discovery-1", "user-agent", activeEdges, doneEdges, edgeLabel(snapshot, "discovery-1-user-agent"), agentEdgeOptions),
    edge("discovery-2", "user-agent", activeEdges, doneEdges, edgeLabel(snapshot, "discovery-2-user-agent"), agentEdgeOptions),
    edge("user-agent", "service-agent", activeEdges, doneEdges, edgeLabel(snapshot, "service-agent-user-agent"), { id: "service-agent-user-agent", variant: "trust", sourcePort: "left", targetPort: "right" }),
  ];
  return { nodes, edges, verticalOffsetPx: topologyVerticalOffsetPx(snapshot.activeScenario) };
}

function buildCommerceGraph(snapshot: DemoSnapshot): { nodes: GraphNodeView[]; edges: GraphEdgeView[]; verticalOffsetPx: number } {
  const positions: Record<string, { x: number; y: number }> = {
    "registrar-1": { x: -144, y: -35 },
    root: { x: 236, y: -35 },
    cdn: { x: 634, y: -35 },
    "discovery-1": { x: 1014, y: -35 },
    "commerce-platform": { x: -144, y: 507 },
    "commerce-merchant-a": { x: 276, y: 200 },
    "commerce-payment": { x: 674, y: 200 },
    "commerce-logistics": { x: 620, y: 435 },
    "commerce-user": { x: 1214, y: 507 },
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
    edge("commerce-platform", "registrar-1", activeEdges, doneEdges, edgeLabel(snapshot, "commerce-platform-registrar-1"), { id: "commerce-platform-registrar-1", sourcePort: "top", targetPort: "bottom" }),
    edge("registrar-1", "root", activeEdges, doneEdges, edgeLabel(snapshot, "registrar-1-root")),
    edge("root", "cdn", activeEdges, doneEdges, edgeLabel(snapshot, "root-cdn"), { sourcePort: "right", targetPort: "left" }),
    edge("cdn", "discovery-1", activeEdges, doneEdges, edgeLabel(snapshot, "cdn-discovery-1")),
    edge("discovery-1", "commerce-user", activeEdges, doneEdges, edgeLabel(snapshot, "commerce-discovery-user"), { id: "commerce-discovery-user", sourcePort: "right", targetPort: "top" }),
    edge("commerce-user", "commerce-platform", activeEdges, doneEdges, edgeLabel(snapshot, "commerce-user-platform"), { id: "commerce-user-platform", variant: "trust", sourcePort: "left", targetPort: "right" }),
    edge("commerce-platform", "commerce-merchant-a", activeEdges, doneEdges, edgeLabel(snapshot, "commerce-platform-merchant-a"), { id: "commerce-platform-merchant-a", variant: "trust" }),
    edge("commerce-user", "commerce-merchant-a", activeEdges, doneEdges, edgeLabel(snapshot, "commerce-user-merchant-a"), { id: "commerce-user-merchant-a", variant: "trust", sourcePort: "left", targetPort: "right" }),
    edge("commerce-user", "commerce-payment", activeEdges, doneEdges, edgeLabel(snapshot, "commerce-user-payment"), { id: "commerce-user-payment", variant: "trust", sourcePort: "left", targetPort: "right" }),
    edge("commerce-merchant-a", "commerce-logistics", activeEdges, doneEdges, edgeLabel(snapshot, "commerce-merchant-a-logistics"), { id: "commerce-merchant-a-logistics", variant: "trust" }),
  ];
  return { nodes, edges, verticalOffsetPx: topologyVerticalOffsetPx(snapshot.activeScenario) };
}

function adjustedTopologyY(nodeId: string, y: number, scenarioId?: DemoScenarioId): number {
  return y;
}

function topologyVerticalOffsetPx(scenarioId?: DemoScenarioId): number {
  const grid = 18;
  return scenarioId && scenarioId !== "authorization-history" ? -3 * grid : 0;
}

function edge(source: string, target: string, activeEdges: Set<string>, doneEdges: Set<string>, label?: string, options: GraphEdgeOptions = {}): GraphEdgeView {
  const id = options.id ?? `${source}-${target}`;
  const active = activeEdges.has(id);
  const done = doneEdges.has(id);
  const verticalRootCdn = source === "root" && target === "cdn";
  const trust = options.variant === "trust";
  const authorization = options.variant === "authorization";
  const agentToRegistrar = source === "service-agent" && target.startsWith("registrar-");
  const discoveryToUser = source.startsWith("discovery-") && target === "user-agent";
  return {
    id,
    source,
    target,
    label,
    active,
    done,
    sourcePort: options.sourcePort ?? (verticalRootCdn ? "bottom" : agentToRegistrar ? "top" : "right"),
    targetPort: options.targetPort ?? (verticalRootCdn ? "top" : discoveryToUser ? "top" : "left"),
    curved: trust,
    trust,
    authorization,
  };
}

function shortDid(did: string): string {
  return `${did.slice(0, 14)}...${did.slice(-6)}`;
}

function Metric({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`metric ${className ?? ""}`.trim()}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FlowBanner({
  snapshot,
  labels,
}: {
  snapshot: DemoSnapshot;
  labels: { ready: string; running: string; startingNodes: string; empty: string };
}) {
  const latest = snapshot.events[snapshot.events.length - 1];
  const stats = snapshot.stats;
  const total = Number(stats.total ?? 0);
  const accepted = Number(stats.accepted ?? 0);
  const current = Number(stats.current ?? accepted);
  const percent = total > 0 ? Math.round((current / total) * 100) : snapshot.running ? 12 : 100;
  const phase = snapshot.running && !pipelineStarted(snapshot) ? labels.startingNodes : snapshot.running ? labels.running : labels.ready;
  return (
    <div className="flow-banner flow-banner-ready">
      <div>
        <strong>{phase}</strong>
        <span>{latest?.title ?? labels.empty}</span>
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
  if (snapshot.activeScenario === "agentic-commerce") {
    const add = (...ids: string[]) => ids.forEach((id) => active.add(id));
    for (const event of snapshot.events.slice(-8)) {
      const ownerNode = event.resource?.ownerNode;
      if ((event.kind === "resource-created" || event.kind === "resource-registered") && ownerNode) add("commerce-platform-registrar-1");
      if (event.kind === "resource-registered" || event.kind === "root-verified") add("registrar-1-root");
      if (event.kind === "root-verified" || event.kind === "cdn-published") add("root-cdn");
      if (event.kind === "cdn-published" || event.kind === "discovery-indexed") add("cdn-discovery-1", "commerce-discovery-user");
      if (event.kind === "commerce-step" && typeof event.stats?.activeCommerceEdge === "string") add(event.stats.activeCommerceEdge);
      if (event.kind === "trusted-connected") add("commerce-user-merchant-a");
    }
    return active;
  }
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
  if (snapshot.activeScenario === "authorization-history") return done;
  if (snapshot.running || !snapshot.events.some((event) => event.kind === "scenario-completed")) return done;
  const add = (...ids: string[]) => ids.forEach((id) => done.add(id));
  if (snapshot.activeScenario === "agentic-commerce") {
    add(
      "commerce-platform-registrar-1",
      "registrar-1-root",
      "root-cdn",
      "cdn-discovery-1",
      "commerce-discovery-user",
      "commerce-user-platform",
      "commerce-platform-merchant-a",
      "commerce-user-merchant-a",
      "commerce-user-payment",
      "commerce-merchant-a-logistics",
    );
    return done;
  }
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
    "commerce-platform-registrar-1": ["commerce-platform", "registrar-1"],
    "commerce-discovery-user": ["discovery-1", "commerce-user"],
    "commerce-user-platform": ["commerce-user", "commerce-platform"],
    "commerce-platform-merchant-a": ["commerce-platform", "commerce-merchant-a"],
    "commerce-user-merchant-a": ["commerce-user", "commerce-merchant-a"],
    "commerce-user-payment": ["commerce-user", "commerce-payment"],
    "commerce-merchant-a-logistics": ["commerce-merchant-a", "commerce-logistics"],
  };
  activeEdges.forEach((id) => endpoints[id]?.forEach((nodeId) => nodes.add(nodeId)));
  const latest = snapshot.events[snapshot.events.length - 1];
  if (snapshot.activeScenario === "authorization-history" && snapshot.running && latest?.kind === "authorization-updated") {
    nodes.add("onchain-governance");
  }
  if ((pipelineStarted(snapshot) || latest?.kind === "authorization-updated") && latest?.nodeId) nodes.add(latest.nodeId);
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
      "commerce-step",
      "pressure-progress",
      "authorization-updated",
    ].includes(event.kind),
  );
}

function resourcesGroupedByNode(snapshot: DemoSnapshot): Record<string, string> {
  const groups: Record<string, number> = {};
  const add = (nodeId: string) => {
    groups[nodeId] = (groups[nodeId] ?? 0) + 1;
  };
  for (const resource of snapshot.resources) {
    if (snapshot.activeScenario === "agentic-commerce") {
      if (resource.ownerNode) add(resource.ownerNode);
      if (resource.stage !== "created") add(resource.registrarNode ?? "registrar-1");
      continue;
    }
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
  if (snapshot.activeScenario === "agentic-commerce") {
    const zh = snapshot.stats.__locale === "zh";
    const labels: Record<string, string> = zh
      ? {
          "commerce-discovery-user": "候选",
          "commerce-user-platform": "验证",
          "commerce-platform-merchant-a": "询价",
          "commerce-user-merchant-a": "下单",
          "commerce-user-payment": "支付",
          "commerce-merchant-a-logistics": "物流",
        }
      : {
          "commerce-discovery-user": "candidate",
          "commerce-user-platform": "verify",
          "commerce-platform-merchant-a": "quote",
          "commerce-user-merchant-a": "order",
          "commerce-user-payment": "pay",
          "commerce-merchant-a-logistics": "ship",
        };
    if (labels[edgeId]) return labels[edgeId];
  }
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
