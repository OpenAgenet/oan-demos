// Copyright (c) 2026 OpenAgenet contributors
//
// Initial author: JINLIANG XU
// Email: jlxufly@gmail.com

import http from "node:http";
import path from "node:path";
import { DemoEventBus } from "./event-bus.js";

const workspaceRoot = path.resolve(process.cwd(), "..");
process.env.OAN_WORKSPACE_ROOT ??= workspaceRoot;
process.env.OAN_PROTOCOL_COMMON_ROOT ??= path.join(workspaceRoot, "oan-protocol-common");
process.env.OAN_ROOT_SERVICES_ROOT ??= path.join(workspaceRoot, "oan-root-services");
process.env.OAN_REGISTRAR_NODE_ROOT ??= path.join(workspaceRoot, "oan-registrar-node");
process.env.OAN_DISCOVERY_NODE_ROOT ??= path.join(workspaceRoot, "oan-discovery-node");
process.env.OAN_EXAMPLES_ROOT ??= path.join(workspaceRoot, "oan-examples");
process.env.OAN_DESIGN_DOCS_ROOT ??= path.join(workspaceRoot, "oan-design-docs");
process.env.OAN_GENESIS_NODES_ROOT ??= path.join(workspaceRoot, "oan-design-docs", "genesis", "nodes");
process.env.OAN_AGENT_PY_ROOT ??= path.join(workspaceRoot, "oan-agent-py");
process.env.OAN_BENCH_DB_BACKEND ??= "postgres";
process.env.OAN_NATS_SERVER_PATH ??= path.join("D:", "ProgramFiles", "nats", "nats-server", "nats-server.exe");

const bus = new DemoEventBus();
const port = Number.parseInt(process.env.OAN_DEMO_SERVER_PORT ?? "8787", 10);
let activeRun: Promise<void> | null = null;

function sendJson(res: http.ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/snapshot") {
      sendJson(res, 200, bus.getSnapshot());
      return;
    }

    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      });
      res.write(`event: snapshot\ndata: ${JSON.stringify(bus.getSnapshot())}\n\n`);
      const unsubscribe = bus.subscribe((event) => {
        res.write(`event: demo\ndata: ${JSON.stringify(event)}\n\n`);
      });
      req.on("close", unsubscribe);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/scenarios/run") {
      const body = await readBody(req);
      if (activeRun) {
        sendJson(res, 409, { error: "scenario_already_running" });
        return;
      }
      activeRun = import("./scenarios.js")
        .then(({ runScenario }) => runScenario(String(body.scenarioId), bus))
        .catch((error) => {
          console.error(error);
        })
        .finally(() => {
          activeRun = null;
        });
      sendJson(res, 202, { status: "started", scenarioId: body.scenarioId });
      return;
    }

    sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    sendJson(res, 500, { error: "demo_server_error", message: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`OAN demo server listening on http://127.0.0.1:${port}`);
});
