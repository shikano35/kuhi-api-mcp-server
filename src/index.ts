import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import fs from "node:fs";
import path from "node:path";
import type {
  HaikuMonument,
  HaikuMonumentResponse,
  GeoJSONFeatureCollection,
  GeoJSONFeature,
} from "./types.js";

const server = new McpServer({
  name: "kuhi-api",
  version: "0.0.1",
});

const API_BASE_URL = "https://api.kuhiapi.com";

async function fetchHaikuMonuments(): Promise<HaikuMonument[]> {
  const response = await fetch(`${API_BASE_URL}/haiku-monuments`);
  if (!response.ok) {
    throw new Error("Failed to fetch haiku monuments");
  }
  const data = (await response.json()) as HaikuMonumentResponse;
  return data.haiku_monuments;
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

function convertToGeoJSON(monuments: HaikuMonument[]): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = monuments.map((monument) => {
    const location = monument.locations[0];
    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [location.longitude, location.latitude] as [number, number],
      },
      properties: {
        id: monument.id,
        text: monument.text,
        established_date: monument.established_date,
        commentary: monument.commentary,
        image_url: monument.image_url,
        poet_name: monument.poets[0]?.name || "",
        prefecture: location.prefecture,
        region: location.region,
        address: location.address,
        name: location.name,
      },
    };
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

async function generateGeoJSONFile(outputPath: string): Promise<void> {
  try {
    const monuments = await fetchHaikuMonuments();
    const geojson = convertToGeoJSON(monuments);
    
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
    console.log(`GeoJSONファイルを生成しました: ${outputPath}`);
  } catch (error) {
    console.error("GeoJSONファイルの生成中にエラーが発生しました:", error);
    throw error;
  }
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

server.tool(
  "get_haiku_monuments_geojson",
  "句碑データベースに登録されているすべての句碑の情報をGeoJSON形式で表示",
  {},
  async () => {
    const monuments = await fetchHaikuMonuments();
    const geojson = convertToGeoJSON(monuments);
    return { content: [{ type: "text", text: JSON.stringify(geojson) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  if (process.argv[2]) {
    try {
      await generateGeoJSONFile(process.argv[2]);
    } catch (error) {
      console.error("GeoJSONファイルの生成に失敗しました:", error);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
