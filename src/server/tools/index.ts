import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchTools } from "./search.js";
import { registerTourismTools } from "./tourism.js";
import { registerGeoJSONTools } from "./geojson.js";

export function registerAllTools(server: McpServer): void {
  registerTourismTools(server);
  registerSearchTools(server);
  registerGeoJSONTools(server);
}
