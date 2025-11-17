import { randomUUID } from "node:crypto";
import { type IncomingMessage, createServer } from "node:http";
import { URL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { logger } from "./logger.js";
import { createMcpServer } from "./server/create-server.js";

// biome-ignore lint/complexity/useLiteralKeys: process.env requires bracket notation for strict TypeScript
const PORT = Number.parseInt(process.env["PORT"] ?? "8786", 10);
// biome-ignore lint/complexity/useLiteralKeys: process.env requires bracket notation for strict TypeScript
const HTTP_PATH = process.env["MCP_HTTP_PATH"] ?? "/mcp";

function buildRequestUrl(req: IncomingMessage): URL {
  const origin = req.headers.host ?? `localhost:${PORT}`;
  const base = origin.startsWith("http") ? origin : `http://${origin}`;
  return new URL(req.url ?? "/", base);
}

async function startServer() {
  const mcpServer = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  await mcpServer.connect(transport);

  const httpServer = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      [
        "Content-Type",
        "Authorization",
        "MCP-Session-Id",
        "MCP-Protocol-Version",
      ].join(", "),
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const requestUrl = buildRequestUrl(req);

    if (requestUrl.pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          version: "2.0.0",
          transport: "streamable-http",
          uptime: process.uptime(),
        }),
      );
      return;
    }

    if (requestUrl.pathname === HTTP_PATH) {
      try {
        await transport.handleRequest(req, res);
      } catch (error) {
        logger.error("Streamable HTTP request failed", { error });
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed to process MCP request" }));
        }
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  httpServer.listen(PORT, () => {
    logger.info(`MCP Server listening on http://localhost:${PORT}${HTTP_PATH}`);
  });

  process.on("SIGTERM", () => {
    httpServer.close(() => {
      process.exit(0);
    });
  });
}

startServer().catch((error) => {
  logger.error("Failed to start HTTP server", { error });
  process.exit(1);
});
