#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CONFIG, ENDPOINTS } from "./config.js";
import { logger } from "./logger.js";
import {
  HaikuMonumentResponseSchema,
  HaikuMonumentSchema,
  LocationSchema,
  PoetSchema,
  SourceSchema,
} from "./schemas.js";
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
import {
  formatHaikuMonumentForDisplay,
  formatStatisticsForDisplay,
  validateCoordinates,
} from "./utils.js";

const server = new McpServer({
  name: "kuhi-api-mcp-server",
  version: "1.4.1",
});

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  size: number;
  lastAccessed: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_SIZE_LIMIT = 50 * 1024 * 1024;
let currentCacheSize = 0;

const cacheMetrics = {
  hits: 0,
  misses: 0,
  evictions: 0,
  totalRequests: 0,
  get hitRate() {
    return this.totalRequests > 0 ? this.hits / this.totalRequests : 0;
  },
  reset() {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.totalRequests = 0;
  },
};

/**
 * 安定したキャッシュキーを生成（オブジェクトキーをソートして文字列化）
 */
function getCacheKey(url: string, params?: Record<string, unknown>): string {
  if (!params) return url;
  const sortedParams: Record<string, unknown> = {};
  for (const key of Object.keys(params).sort()) {
    sortedParams[key] = params[key];
  }
  return `${url}:${JSON.stringify(sortedParams)}`;
}

/**
 * キャッシュからデータを取得
 */
function getFromCache<T>(key: string): T | null {
  cacheMetrics.totalRequests++;

  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    cacheMetrics.misses++;
    return null;
  }

  if (Date.now() - entry.timestamp > CONFIG.CACHE_DURATION) {
    cache.delete(key);
    currentCacheSize -= entry.size;
    cacheMetrics.misses++;
    logger.debug(`Cache expired for key: ${key}`);
    return null;
  }

  entry.lastAccessed = Date.now();
  cacheMetrics.hits++;
  logger.debug(`Cache hit for key: ${key}`);
  return entry.data;
}

/**
 * データをキャッシュに保存
 */
function setCache<T>(key: string, data: T): void {
  const dataStr = JSON.stringify(data);
  const size = Buffer.byteLength(dataStr, "utf8");

  // サイズ制限チェック
  if (size > CACHE_SIZE_LIMIT / 10) {
    logger.warn(`Data too large to cache (${size} bytes): ${key}`);
    return;
  }

  while (currentCacheSize + size > CACHE_SIZE_LIMIT && cache.size > 0) {
    let oldestKey: string | undefined;
    let oldestTime = Date.now();

    for (const [entryKey, entry] of cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = entryKey;
      }
    }

    if (!oldestKey) break;

    const oldEntry = cache.get(oldestKey) as CacheEntry<unknown>;
    cache.delete(oldestKey);
    currentCacheSize -= oldEntry.size;
    cacheMetrics.evictions++;
    logger.debug(`Evicted cache entry: ${oldestKey}`);
  }

  const now = Date.now();
  cache.set(key, {
    data,
    timestamp: now,
    size,
    lastAccessed: now,
  });
  currentCacheSize += size;
  logger.debug(`Cached data (${size} bytes): ${key}`);
}

/**
 * 共通のリソース取得関数（スキーマ検証とキャッシュ機能付き）
 */
async function fetchResource<T>(
  endpoint: string,
  schema?: z.ZodSchema<T>,
  id?: number | string,
  params?: Record<string, string>,
): Promise<T> {
  const url = buildApiUrl(endpoint, id, params);
  const cacheKey = getCacheKey(url, params);

  // キャッシュから取得を試行
  const cachedData = getFromCache<T>(cacheKey);
  if (cachedData) {
    logger.debug(`Using cached data for: ${url}`);
    return cachedData;
  }

  logger.debug(`Fetching data from: ${url}`);
  const response = await fetchWithRetry(url);
  const data = await handleApiResponse<T>(response);

  // スキーマ検証
  if (schema) {
    try {
      const validatedData = schema.parse(data);
      setCache(cacheKey, validatedData);
      logger.debug(`Schema validation passed for: ${url}`);
      return validatedData;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.warn(`Schema validation failed for ${url}:`, {
        error: errorMessage,
        endpoint,
      });

      setCache(cacheKey, data);
      return data;
    }
  }

  setCache(cacheKey, data);
  return data;
}

/**
 * エラーハンドリング用のヘルパー関数
 */
async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    const error = new Error(`API Error (${response.status}): ${errorText}`);
    logger.error(`API request failed: ${response.url}`, {
      status: response.status,
      error: errorText,
    });
    throw error;
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    const jsonError = new Error(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`,
    );
    logger.error(`JSON parsing failed for: ${response.url}`, error);
    throw jsonError;
  }
}

// タイムアウト付きfetch
async function fetchWithTimeout(
  url: string,
  timeoutMs = CONFIG.REQUEST_TIMEOUT,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();

  let combinedSignal = controller.signal;

  if (signal) {
    const handleExternalAbort = () => controller.abort();
    signal.addEventListener("abort", handleExternalAbort);

    // クリーンアップ用
    const originalSignal = combinedSignal;
    combinedSignal = new Proxy(originalSignal, {
      get(target, prop) {
        if (prop === "aborted") {
          return target.aborted || signal.aborted;
        }
        return target[prop as keyof AbortSignal];
      },
    }) as AbortSignal;
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: combinedSignal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// リトライ機能付きのfetch
async function fetchWithRetry(
  url: string,
  signal?: AbortSignal,
): Promise<Response> {
  let lastError: Error = new Error("No attempts made");

  logger.debug(`Starting fetch with retry for: ${url}`);

  for (let attempt = 1; attempt <= CONFIG.RETRY_ATTEMPTS; attempt++) {
    try {
      logger.debug(
        `Fetch attempt ${attempt}/${CONFIG.RETRY_ATTEMPTS} for: ${url}`,
      );
      const response = await fetchWithTimeout(
        url,
        CONFIG.REQUEST_TIMEOUT,
        signal,
      );

      if (attempt > 1) {
        logger.info(`Fetch succeeded on attempt ${attempt} for: ${url}`);
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError.name === "AbortError" || signal?.aborted) {
        logger.info(`Request aborted for: ${url}`);
        throw lastError;
      }

      logger.warn(`Fetch attempt ${attempt} failed for ${url}:`, {
        error: lastError.message,
        attempt,
        maxAttempts: CONFIG.RETRY_ATTEMPTS,
      });

      if (attempt === CONFIG.RETRY_ATTEMPTS) {
        logger.error(
          `All ${CONFIG.RETRY_ATTEMPTS} fetch attempts failed for: ${url}`,
          {
            finalError: lastError.message,
          },
        );
        break;
      }

      // 指数バックオフでリトライ間隔を設定
      const delay = Math.min(1000 * 2 ** (attempt - 1), 5000);
      logger.debug(
        `Waiting ${delay}ms before retry ${attempt + 1} for: ${url}`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(
    `Failed after ${CONFIG.RETRY_ATTEMPTS} attempts: ${lastError.message}`,
  );
}

// 配列の安全なアクセス
function safeArrayAccess<T>(
  array: T[] | undefined,
  index: number,
): T | undefined {
  return array && array.length > index ? array[index] : undefined;
}

// URL構築のヘルパー関数
function buildApiUrl(
  endpoint: string,
  id?: number | string,
  params?: Record<string, string>,
): string {
  let url = `${CONFIG.API_BASE_URL}${endpoint}`;

  if (id !== undefined) {
    url += `/${id}`;
  }

  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        searchParams.append(key, value);
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  return url;
}

// API呼び出し関数（共通化）
async function fetchHaikuMonuments(): Promise<HaikuMonument[]> {
  const data = await fetchResource<HaikuMonumentResponse>(
    ENDPOINTS.HAIKU_MONUMENTS,
    z.object({ haiku_monuments: z.array(HaikuMonumentSchema) }),
  );
  return data.haiku_monuments;
}

async function fetchHaikuMonumentById(id: number): Promise<HaikuMonument> {
  return await fetchResource<HaikuMonument>(
    ENDPOINTS.HAIKU_MONUMENTS,
    HaikuMonumentSchema,
    id,
  );
}

async function searchHaikuMonuments(
  options: SearchOptions,
): Promise<HaikuMonument[]> {
  const params = Object.fromEntries(
    Object.entries(options)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );

  const data = await fetchResource<HaikuMonumentResponse>(
    ENDPOINTS.HAIKU_MONUMENTS,
    HaikuMonumentResponseSchema,
    undefined,
    params,
  );
  return data.haiku_monuments;
}

async function fetchPoets(options?: SearchOptions): Promise<Poet[]> {
  const params = options
    ? Object.fromEntries(
        Object.entries(options)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, String(value)]),
      )
    : undefined;

  return await fetchResource<Poet[]>(
    ENDPOINTS.POETS,
    z.array(PoetSchema),
    undefined,
    params,
  );
}

async function fetchPoetById(id: number): Promise<Poet> {
  return await fetchResource<Poet>(ENDPOINTS.POETS, undefined, id);
}

async function fetchHaikuMonumentsByPoet(
  poetId: number,
): Promise<HaikuMonument[]> {
  return await fetchResource<HaikuMonument[]>(
    `${ENDPOINTS.POETS}/${poetId}${ENDPOINTS.HAIKU_MONUMENTS}`,
    z.array(HaikuMonumentSchema),
  );
}

async function fetchSources(options?: SearchOptions): Promise<Source[]> {
  const params = options
    ? Object.fromEntries(
        Object.entries(options)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, String(value)]),
      )
    : undefined;

  return await fetchResource<Source[]>(
    ENDPOINTS.SOURCES,
    z.array(SourceSchema),
    undefined,
    params,
  );
}

async function fetchSourceById(id: number): Promise<Source> {
  return await fetchResource<Source>(ENDPOINTS.SOURCES, undefined, id);
}

async function fetchLocations(options?: SearchOptions): Promise<Location[]> {
  const params = options
    ? Object.fromEntries(
        Object.entries(options)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, String(value)]),
      )
    : undefined;

  return await fetchResource<Location[]>(
    ENDPOINTS.LOCATIONS,
    z.array(LocationSchema),
    undefined,
    params,
  );
}

async function fetchLocationById(id: number): Promise<Location> {
  return await fetchResource<Location>(ENDPOINTS.LOCATIONS, undefined, id);
}

async function fetchHaikuMonumentsByRegion(
  region: string,
): Promise<HaikuMonument[]> {
  const data = await fetchResource<HaikuMonumentResponse>(
    ENDPOINTS.HAIKU_MONUMENTS,
    HaikuMonumentResponseSchema,
    undefined,
    { region },
  );
  return data.haiku_monuments;
}

async function countHaikuMonumentsByPrefecture(
  prefecture: string,
): Promise<number> {
  const data = await fetchResource<HaikuMonumentResponse>(
    ENDPOINTS.HAIKU_MONUMENTS,
    HaikuMonumentResponseSchema,
    undefined,
    { prefecture },
  );
  return data.haiku_monuments.length;
}

async function fetchHaikuMonumentsByCoordinates(
  lat: number,
  lon: number,
  radius: number,
): Promise<HaikuMonument[]> {
  if (!validateCoordinates(lat, lon)) {
    throw new Error(
      "Invalid coordinates: latitude must be between -90 and 90, longitude must be between -180 and 180",
    );
  }
  if (radius <= 0) {
    throw new Error("Invalid radius: radius must be greater than 0");
  }

  const data = await fetchResource<HaikuMonumentResponse>(
    ENDPOINTS.HAIKU_MONUMENTS,
    HaikuMonumentResponseSchema,
    undefined,
    { lat: lat.toString(), lon: lon.toString(), radius: radius.toString() },
  );
  return data.haiku_monuments;
}

function convertToGeoJSON(
  monuments: HaikuMonument[],
): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = monuments
    .filter((monument) => monument.locations && monument.locations.length > 0)
    .map((monument) => {
      const location = safeArrayAccess(monument.locations, 0);
      const poet = safeArrayAccess(monument.poets, 0);

      if (!location) {
        throw new Error(`Monument ${monument.id} has no location data`);
      }

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
          poet_name: poet?.name || "不明",
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
    logger.info(`GeoJSONファイルを生成しました: ${outputPath}`);
  } catch (error) {
    logger.error("GeoJSONファイルの生成中にエラーが発生しました:", error);
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
    const location = safeArrayAccess(monument.locations, 0);
    const poet = safeArrayAccess(monument.poets, 0);

    // 都道府県別
    if (location?.prefecture) {
      byPrefecture[location.prefecture] =
        (byPrefecture[location.prefecture] || 0) + 1;
    }

    // 地域別
    if (location?.region) {
      byRegion[location.region] = (byRegion[location.region] || 0) + 1;
    }

    // 俳人別
    if (poet?.name) {
      byPoet[poet.name] = (byPoet[poet.name] || 0) + 1;
    }

    // 季節別
    if (monument.season) {
      bySeason[monument.season] = (bySeason[monument.season] || 0) + 1;
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
    const location = safeArrayAccess(monument.locations, 0);
    const matchesRegion = !region || location?.region === region;
    return matchesSeason && matchesRegion;
  });
}

function validateNumberInput(
  input: number,
  fieldName: string,
  min?: number,
  max?: number,
): number {
  if (typeof input !== "number" || Number.isNaN(input)) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  if (min !== undefined && input < min) {
    throw new Error(`${fieldName} must be at least ${min}`);
  }

  if (max !== undefined && input > max) {
    throw new Error(`${fieldName} must be at most ${max}`);
  }

  return input;
}

server.tool(
  "get_haiku_monuments",
  "句碑データベースに登録されているすべての句碑の情報を表示",
  {
    limit: z
      .number()
      .optional()
      .default(CONFIG.DEFAULT_LIMIT)
      .describe("取得件数（デフォルト: 50）"),
    offset: z.number().optional().default(0).describe("取得開始位置"),
  },
  async ({ limit = CONFIG.DEFAULT_LIMIT, offset = 0 }) => {
    const searchOptions: SearchOptions = { limit, offset };
    const data = await searchHaikuMonuments(searchOptions);
    return {
      content: [
        {
          type: "text",
          text: `句碑データ（${data.length}件）:\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
  },
);

server.tool(
  "get_haiku_monument_by_id",
  "指定されたIDの句碑の詳細情報を表示",
  { id: z.number().describe("句碑ID") },
  async ({ id }) => {
    const validatedId = validateNumberInput(id, "句碑ID", 1);
    const data = await fetchHaikuMonumentById(validatedId);
    const formatted = formatHaikuMonumentForDisplay(data);
    return {
      content: [
        { type: "text", text: formatted },
        {
          type: "text",
          text: `\n\n【詳細データ（JSON）】\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    };
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
    const formatted = formatStatisticsForDisplay(statistics);
    return {
      content: [
        { type: "text", text: formatted },
        {
          type: "text",
          text: `\n\n【詳細データ（JSON）】\n${JSON.stringify(statistics, null, 2)}`,
        },
      ],
    };
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
      logger.error("GeoJSONファイルの生成に失敗しました:", error);
    }
  }
}

main().catch((error) => {
  logger.error("Fatal error in main():", error);
  process.exit(1);
});
