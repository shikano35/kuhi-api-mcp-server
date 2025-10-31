import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools/index.js";

export interface CreateServerOptions {
  name?: string;
  version?: string;
}

export function createMcpServer(options: CreateServerOptions = {}): McpServer {
  const { name = "kuhi-api-mcp-server", version = "2.0.0" } = options;

  const server = new McpServer({
    name,
    version,
  });

  registerAllTools(server);

  return server;
}
