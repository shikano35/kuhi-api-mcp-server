import fs from "node:fs";
import path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import nodeFetch, {
  Headers as NodeHeaders,
  Request as NodeRequest,
  Response as NodeResponse,
} from "node-fetch";
import { fetchMonuments } from "./api.js";
import { logger } from "./logger.js";
import { createMcpServer } from "./server/create-server.js";
import { convertToGeoJSON } from "./server/tools/geojson.js";

function setupConsoleRedirection(): void {
  const redirectToStderr = (...args: readonly unknown[]): void => {
    process.stderr.write(`${args.join(" ")}\n`);
  };

  console.log = redirectToStderr;
  console.warn = redirectToStderr;
  console.info = redirectToStderr;
}

function setupGlobalFetch(): void {
  if (typeof globalThis.fetch === "undefined") {
    globalThis.fetch = nodeFetch as unknown as typeof globalThis.fetch;
    globalThis.Headers = NodeHeaders as unknown as typeof globalThis.Headers;
    globalThis.Request = NodeRequest as unknown as typeof globalThis.Request;
    globalThis.Response = NodeResponse as unknown as typeof globalThis.Response;
  }
}

setupConsoleRedirection();
setupGlobalFetch();

const server = createMcpServer();

async function generateGeoJSONFile(outputPath: string): Promise<void> {
  try {
    const monuments = await fetchMonuments();
    const geojson = convertToGeoJSON(monuments);

    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
    logger.info(`GeoJSONファイルを生成しました: ${outputPath}`);
  } catch (error) {
    logger.error("GeoJSONファイルの生成中にエラーが発生しました:", error);
    throw error;
  }
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (process.argv[2]) {
    try {
      await generateGeoJSONFile(process.argv[2]);
    } catch (error) {
      logger.error("GeoJSONファイルの生成に失敗しました:", error);
    }
  }
}

main().catch((error) => {
  logger.error("Fatal error in main():", error);
  process.exit(1);
});
