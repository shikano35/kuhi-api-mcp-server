import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { logger } from "./logger.js";
import { registerAllTools } from "./server/tools/index.js";

// biome-ignore lint/complexity/useLiteralKeys: process.env requires bracket notation for strict TypeScript
const PORT = Number.parseInt(process.env["PORT"] ?? "3000", 10);

const mcpServer = new McpServer({
  name: "kuhi-api-mcp-server",
  version: "2.0.0",
});

registerAllTools(mcpServer);

const httpServer = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        version: "2.0.0",
        transport: "sse",
        uptime: process.uptime(),
      }),
    );
    return;
  }

  if (req.url === "/sse" && req.method === "GET") {
    logger.info("New SSE connection established");
    const transport = new SSEServerTransport("/message", res);
    await mcpServer.connect(transport);
    return;
  }

  if (req.url === "/message" && req.method === "POST") {
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "received" }));
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

httpServer.listen(PORT, () => {
  logger.info(`Streamable MCP Server listening on http://localhost:${PORT}`);
  logger.info(`SSE endpoint: http://localhost:${PORT}/sse`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  httpServer.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});
