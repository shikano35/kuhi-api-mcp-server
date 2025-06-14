import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fetch, { type Response } from "node-fetch";
import { z } from "zod";
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  HaikuMonument,
  HaikuMonumentResponse,
  Location,
  Poet,
  SearchOptions,
  Source,
} from "./types.js";

const server = new McpServer({
  name: "kuhi-api-mcp-server",
  version: "1.0.0",
});

const API_BASE_URL = "https://api.kuhiapi.com";

// エラーハンドリング用のヘルパー関数
async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`API Error (${response.status}): ${errorText}`);
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${error}`);
  }
}

// 検索クエリの構築
function buildSearchQuery(options: SearchOptions): string {
  const params = new URLSearchParams();

  if (options.limit) params.append("limit", options.limit.toString());
  if (options.offset) params.append("offset", options.offset.toString());
  if (options.ordering) {
    for (const order of options.ordering) {
      params.append("ordering", order);
    }
  }
  if (options.search) params.append("search", options.search);
  if (options.title_contains)
    params.append("title_contains", options.title_contains);
  if (options.description_contains)
    params.append("description_contains", options.description_contains);
  if (options.name_contains)
    params.append("name_contains", options.name_contains);
  if (options.biography_contains)
    params.append("biography_contains", options.biography_contains);
  if (options.prefecture) params.append("prefecture", options.prefecture);
  if (options.region) params.append("region", options.region);
  if (options.created_at_gt)
    params.append("created_at_gt", options.created_at_gt);
  if (options.created_at_lt)
    params.append("created_at_lt", options.created_at_lt);
  if (options.updated_at_gt)
    params.append("updated_at_gt", options.updated_at_gt);
  if (options.updated_at_lt)
    params.append("updated_at_lt", options.updated_at_lt);

  return params.toString();
}

async function fetchHaikuMonuments(): Promise<HaikuMonument[]> {
  const response = await fetch(`${API_BASE_URL}/haiku-monuments`);
  const data = await handleApiResponse<HaikuMonumentResponse>(response);
  return data.haiku_monuments;
}

async function fetchHaikuMonumentById(id: number): Promise<HaikuMonument> {
  const response = await fetch(`${API_BASE_URL}/haiku-monuments/${id}`);
  const data = await handleApiResponse<{ haiku_monument: HaikuMonument }>(
    response,
  );
  return data.haiku_monument;
}

async function searchHaikuMonuments(
  options: SearchOptions,
): Promise<HaikuMonument[]> {
  const queryString = buildSearchQuery(options);
  const response = await fetch(
    `${API_BASE_URL}/haiku-monuments?${queryString}`,
  );
  const data = await handleApiResponse<HaikuMonumentResponse>(response);
  return data.haiku_monuments;
}

async function fetchPoets(options?: SearchOptions): Promise<Poet[]> {
  const queryString = options ? buildSearchQuery(options) : "";
  const url = queryString
    ? `${API_BASE_URL}/poets?${queryString}`
    : `${API_BASE_URL}/poets`;
  const response = await fetch(url);
  return await handleApiResponse<Poet[]>(response);
}

async function fetchPoetById(id: number): Promise<Poet> {
  const response = await fetch(`${API_BASE_URL}/poets/${id}`);
  return await handleApiResponse<Poet>(response);
}

async function fetchHaikuMonumentsByPoet(
  poetId: number,
): Promise<HaikuMonument[]> {
  const response = await fetch(
    `${API_BASE_URL}/poets/${poetId}/haiku-monuments`,
  );
  return await handleApiResponse<HaikuMonument[]>(response);
}

async function fetchSources(options?: SearchOptions): Promise<Source[]> {
  const queryString = options ? buildSearchQuery(options) : "";
  const url = queryString
    ? `${API_BASE_URL}/sources?${queryString}`
    : `${API_BASE_URL}/sources`;
  const response = await fetch(url);
  return await handleApiResponse<Source[]>(response);
}

async function fetchSourceById(id: number): Promise<Source> {
  const response = await fetch(`${API_BASE_URL}/sources/${id}`);
  return await handleApiResponse<Source>(response);
}

async function fetchLocations(options?: SearchOptions): Promise<Location[]> {
  const queryString = options ? buildSearchQuery(options) : "";
  const url = queryString
    ? `${API_BASE_URL}/locations?${queryString}`
    : `${API_BASE_URL}/locations`;
  const response = await fetch(url);
  return await handleApiResponse<Location[]>(response);
}

async function fetchLocationById(id: number): Promise<Location> {
  const response = await fetch(`${API_BASE_URL}/locations/${id}`);
  return await handleApiResponse<Location>(response);
}

async function fetchHaikuMonumentsByRegion(
  region: string,
): Promise<HaikuMonument[]> {
  const response = await fetch(
    `${API_BASE_URL}/haiku-monuments?region=${encodeURIComponent(region)}`,
  );
  const data = await handleApiResponse<HaikuMonumentResponse>(response);
  return data.haiku_monuments;
}

async function countHaikuMonumentsByPrefecture(
  prefecture: string,
): Promise<number> {
  const response = await fetch(
    `${API_BASE_URL}/haiku-monuments?prefecture=${encodeURIComponent(prefecture)}`,
  );
  const data = await handleApiResponse<HaikuMonumentResponse>(response);
  return data.haiku_monuments.length;
}

async function fetchHaikuMonumentsByCoordinates(
  lat: number,
  lon: number,
  radius: number,
): Promise<HaikuMonument[]> {
  const response = await fetch(
    `${API_BASE_URL}/haiku-monuments?lat=${lat}&lon=${lon}&radius=${radius}`,
  );
  const data = await handleApiResponse<HaikuMonumentResponse>(response);
  return data.haiku_monuments;
}

function convertToGeoJSON(
  monuments: HaikuMonument[],
): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = monuments.map((monument) => {
    const location = monument.locations[0];
    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [location.longitude, location.latitude] as [
          number,
          number,
        ],
      },
      properties: {
        id: monument.id,
        inscription: monument.inscription,
        established_date: monument.established_date,
        commentary: monument.commentary,
        photo_url: monument.photo_url,
        poet_name: monument.poets[0]?.name || "",
        prefecture: location.prefecture,
        region: location.region,
        address: location.address,
        place_name: location.place_name,
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

// 統計・分析関数
async function getHaikuMonumentsStatistics(): Promise<{
  total: number;
  byPrefecture: Record<string, number>;
  byRegion: Record<string, number>;
  byPoet: Record<string, number>;
  bySeason: Record<string, number>;
}> {
  const monuments = await fetchHaikuMonuments();

  const byPrefecture: Record<string, number> = {};
  const byRegion: Record<string, number> = {};
  const byPoet: Record<string, number> = {};
  const bySeason: Record<string, number> = {};

  for (const monument of monuments) {
    // 都道府県別
    const prefecture = monument.locations[0]?.prefecture;
    if (prefecture) {
      byPrefecture[prefecture] = (byPrefecture[prefecture] || 0) + 1;
    }

    // 地域別
    const region = monument.locations[0]?.region;
    if (region) {
      byRegion[region] = (byRegion[region] || 0) + 1;
    }

    // 俳人別
    const poetName = monument.poets[0]?.name;
    if (poetName) {
      byPoet[poetName] = (byPoet[poetName] || 0) + 1;
    }

    // 季節別
    const season = monument.season;
    if (season) {
      bySeason[season] = (bySeason[season] || 0) + 1;
    }
  }

  return {
    total: monuments.length,
    byPrefecture,
    byRegion,
    byPoet,
    bySeason,
  };
}

async function findSimilarMonuments(
  searchText: string,
  limit = 5,
): Promise<HaikuMonument[]> {
  const searchOptions: SearchOptions = {
    search: searchText,
    limit,
  };
  return await searchHaikuMonuments(searchOptions);
}

async function getMonumentsBySeasonAndRegion(
  season: string,
  region?: string,
): Promise<HaikuMonument[]> {
  const monuments = await fetchHaikuMonuments();

  return monuments.filter((monument) => {
    const matchesSeason = monument.season === season;
    const matchesRegion = !region || monument.locations[0]?.region === region;
    return matchesSeason && matchesRegion;
  });
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
  "get_haiku_monument_by_id",
  "指定されたIDの句碑の詳細情報を表示",
  { id: z.number().describe("句碑ID") },
  async ({ id }) => {
    const data = await fetchHaikuMonumentById(id);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

server.tool(
  "search_haiku_monuments",
  "検索条件を指定して句碑を検索",
  {
    search: z.string().optional().describe("検索キーワード"),
    prefecture: z.string().optional().describe("都道府県名"),
    region: z.string().optional().describe("地域名"),
    title_contains: z.string().optional().describe("句に含まれる文字列"),
    description_contains: z
      .string()
      .optional()
      .describe("解説に含まれる文字列"),
    limit: z.number().optional().describe("取得件数"),
    offset: z.number().optional().describe("取得開始位置"),
  },
  async (options) => {
    const data = await searchHaikuMonuments(options);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

server.tool(
  "get_poets",
  "俳人の一覧を表示",
  {
    name_contains: z.string().optional().describe("俳人名に含まれる文字列"),
    biography_contains: z.string().optional().describe("経歴に含まれる文字列"),
    limit: z.number().optional().describe("取得件数"),
  },
  async (options) => {
    const data = await fetchPoets(options);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

server.tool(
  "get_poet_by_id",
  "指定されたIDの俳人の詳細情報を表示",
  { id: z.number().describe("俳人ID") },
  async ({ id }) => {
    const data = await fetchPoetById(id);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

server.tool(
  "get_haiku_monuments_by_poet",
  "指定された俳人の句碑一覧を表示",
  { poetId: z.number().describe("俳人ID") },
  async ({ poetId }) => {
    const data = await fetchHaikuMonumentsByPoet(poetId);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

server.tool(
  "get_sources",
  "出典の一覧を表示",
  {
    title_contains: z.string().optional().describe("タイトルに含まれる文字列"),
    limit: z.number().optional().describe("取得件数"),
  },
  async (options) => {
    const data = await fetchSources(options);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

server.tool(
  "get_source_by_id",
  "指定されたIDの出典の詳細情報を表示",
  { id: z.number().describe("出典ID") },
  async ({ id }) => {
    const data = await fetchSourceById(id);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

server.tool(
  "get_locations",
  "設置場所の一覧を表示",
  {
    prefecture: z.string().optional().describe("都道府県名"),
    region: z.string().optional().describe("地域名"),
    limit: z.number().optional().describe("取得件数"),
  },
  async (options) => {
    const data = await fetchLocations(options);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

server.tool(
  "get_location_by_id",
  "指定されたIDの設置場所の詳細情報を表示",
  { id: z.number().describe("設置場所ID") },
  async ({ id }) => {
    const data = await fetchLocationById(id);
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

server.tool(
  "get_haiku_monuments_statistics",
  "句碑データベースの統計情報を表示",
  {},
  async () => {
    const statistics = await getHaikuMonumentsStatistics();
    return { content: [{ type: "text", text: JSON.stringify(statistics) }] };
  },
);

server.tool(
  "find_similar_monuments",
  "類似の句碑を検索",
  {
    searchText: z.string().describe("検索テキスト"),
    limit: z.number().optional().describe("取得件数"),
  },
  async ({ searchText, limit }) => {
    const data = await findSimilarMonuments(searchText, limit);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

server.tool(
  "get_monuments_by_season_and_region",
  "季節と地域で句碑を絞り込み",
  {
    season: z.string().describe("季節"),
    region: z.string().optional().describe("地域名"),
  },
  async ({ season, region }) => {
    const data = await getMonumentsBySeasonAndRegion(season, region);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
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
