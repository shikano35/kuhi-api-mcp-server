import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fetch from "node-fetch";

const server = new McpServer({
  name: "kuhi-api-geojson",
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

interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    id: number;
    text: string;
    established_date: string;
    commentary: string;
    image_url: string;
    poet_name: string;
    prefecture: string;
    region: string;
    address: string;
    name: string;
  };
}

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

async function fetchHaikuMonuments(): Promise<HaikuMonument[]> {
  const response = await fetch(`${API_BASE_URL}/haiku-monuments`);
  if (!response.ok) {
    throw new Error("Failed to fetch haiku monuments");
  }
  return (await response.json()) as HaikuMonument[];
}

function convertToGeoJSON(monuments: HaikuMonument[]): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = monuments.map((monument) => {
    const location = monument.locations[0];
    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [location.longitude, location.latitude],
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
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
}); 