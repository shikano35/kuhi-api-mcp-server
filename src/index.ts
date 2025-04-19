import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

const server = new McpServer({
  name: "kuhi-api",
  version: "0.0.1",
});

const API_BASE_URL = "https://api.kuhiapi.com";

interface HaikuMonument {
  id: number;
  text: string;
  established_date: string;
  commentary: string;
  image_url: string;
  created_at: string;
  updated_at: string;
  poet_id: number;
  source_id: number;
  location_id: number;
  poets: Array<{
    id: number;
    name: string;
    biography: string;
    links: string;
    image_url: string;
    created_at: string;
    updated_at: string;
  }>;
  sources: Array<{
    id: number;
    title: string;
    author: string;
    year: number;
    url: string;
    publisher: string;
    created_at: string;
    updated_at: string;
  }>;
  locations: Array<{
    id: number;
    prefecture: string;
    region: string;
    address: string;
    latitude: number;
    longitude: number;
    name: string;
  }>;
}

async function fetchHaikuMonuments() {
  const response = await fetch(`${API_BASE_URL}/haiku-monuments`);
  if (!response.ok) {
    throw new Error("Failed to fetch haiku monuments");
  }
  return response.json() as Promise<HaikuMonument[]>;
}

async function fetchHaikuMonumentsByRegion(region: string) {
  const response = await fetch(
    `${API_BASE_URL}/locations?region=${encodeURIComponent(region)}`,
  );
  if (!response.ok) {
    throw new Error("Failed to fetch haiku monuments by region");
  }
  return response.json() as Promise<HaikuMonument[]>;
}

async function countHaikuMonumentsByPrefecture(prefecture: string) {
  const response = await fetch(
    `${API_BASE_URL}/locations?prefecture=${encodeURIComponent(prefecture)}`,
  );
  if (!response.ok) {
    throw new Error("Failed to count haiku monuments by prefecture");
  }
  const data = (await response.json()) as HaikuMonument[];
  return data.length;
}

async function fetchHaikuMonumentsByCoordinates(
  lat: number,
  lon: number,
  radius: number,
) {
  const response = await fetch(
    `${API_BASE_URL}/haiku-monuments?lat=${lat}&lon=${lon}&radius=${radius}`,
  );
  if (!response.ok) {
    throw new Error("Failed to fetch haiku monuments by coordinates");
  }
  return response.json() as Promise<HaikuMonument[]>;
}

server.tool(
  "get_haiku_monuments",
  "句碑データベースに登録されているすべての句碑の情報を表示",
  {},
  async () => {
    const data = await fetchHaikuMonuments();
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

server.tool(
  "get_haiku_monuments_by_region",
  "指定された地域の句碑を表示",
  { region: z.string().describe("地域名") },
  async ({ region }) => {
    const data = await fetchHaikuMonumentsByRegion(region);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

server.tool(
  "count_haiku_monuments_by_prefecture",
  "指定された県の句碑の数を表示",
  { prefecture: z.string().describe("県名") },
  async ({ prefecture }) => {
    const count = await countHaikuMonumentsByPrefecture(prefecture);
    return { content: [{ type: "text", text: count.toString() }] };
  },
);

server.tool(
  "get_haiku_monuments_by_coordinates",
  "指定された緯度経度範囲内の句碑を表示",
  {
    lat: z.number().describe("緯度"),
    lon: z.number().describe("経度"),
    radius: z.number().describe("半径(m)"),
  },
  async ({ lat, lon, radius }) => {
    const data = await fetchHaikuMonumentsByCoordinates(lat, lon, radius);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
