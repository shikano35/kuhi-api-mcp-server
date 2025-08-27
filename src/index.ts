#!/usr/bin/env node

import nodeFetch, {
  Headers as NodeHeaders,
  Request as NodeRequest,
  Response as NodeResponse,
} from "node-fetch";

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

import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CONFIG, ENDPOINTS } from "./config.js";
import { logger } from "./logger.js";
import {
  LocationSchema,
  MonumentSchema,
  MonumentsResponseSchema,
  PoetSchema,
  SourceSchema,
  SearchOptionsSchema,
  PoetsResponseSchema,
} from "./schemas.js";
import type { GeoJSONFeature, GeoJSONFeatureCollection, Location, Monument, Poet, SearchOptions, Source } from "./types.js";
import {
  formatMonumentForDisplay,
  formatStatisticsForDisplay,
  validateCoordinates,
} from "./utils.js";

const server = new McpServer({
  name: "kuhi-api-mcp-server",
  version: "2.0.0",
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

function getCacheKey(url: string, params?: Record<string, unknown>): string {
  if (!params) return url;

  try {
    const sortedParams: Record<string, unknown> = {};
    for (const key of Object.keys(params).sort()) {
      sortedParams[key] = params[key];
    }
    return `${url}:${JSON.stringify(sortedParams)}`;
  } catch {
    return url;
  }
}

function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  const typedEntry = entry as CacheEntry<T>;
  if (Date.now() - typedEntry.timestamp > CONFIG.CACHE_DURATION) {
    cache.delete(key);
    currentCacheSize -= typedEntry.size;
    return null;
  }

  typedEntry.lastAccessed = Date.now();
  return typedEntry.data;
}

function setCache<T>(key: string, data: T): void {
  const dataStr = JSON.stringify(data);
  const size = Buffer.byteLength(dataStr, "utf8");

  if (size > CACHE_SIZE_LIMIT / 10) {
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

    const oldEntry = cache.get(oldestKey);
    if (oldEntry) {
      const typedOldEntry = oldEntry as CacheEntry<unknown>;
      cache.delete(oldestKey);
      currentCacheSize -= typedOldEntry.size;
    }
  }

  const now = Date.now();
  cache.set(key, {
    data,
    timestamp: now,
    size,
    lastAccessed: now,
  });
  currentCacheSize += size;
}

interface ValidationMetrics {
  totalRequests: number;
  validationFailures: number;
  lastFailureAt: Date | null;
  failuresByEndpoint: Record<string, number>;
}

const validationMetrics: ValidationMetrics = {
  totalRequests: 0,
  validationFailures: 0,
  lastFailureAt: null,
  failuresByEndpoint: {},
};

interface FetchResourceOptions {
  skipValidation?: boolean;
  logValidationFailures?: boolean;
}

async function fetchResource<T>(
  endpoint: string,
  schema?: z.ZodSchema<T>,
  id?: number | string,
  params?: Record<string, string>,
  options: FetchResourceOptions = {},
): Promise<T> {
  const url = buildApiUrl(endpoint, id, params);
  const cacheKey = getCacheKey(url, params);

  const cachedData = getFromCache<T>(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  const response = await fetchWithRetry(url);
  const rawData = await handleApiResponse<unknown>(response);

  validationMetrics.totalRequests += 1;

  if (schema && !options.skipValidation) {
    try {
      const validatedData = schema.parse(rawData);
      setCache(cacheKey, validatedData);
      return validatedData;
    } catch (error) {
      validationMetrics.validationFailures += 1;
      validationMetrics.lastFailureAt = new Date();
      validationMetrics.failuresByEndpoint[endpoint] =
        (validationMetrics.failuresByEndpoint[endpoint] ?? 0) + 1;

      if (options.logValidationFailures !== false) {
        logger.warn("Schema validation failed for external API response", {
          endpoint,
          url,
          error: error instanceof Error ? error.message : String(error),
          validationMetrics,
        });
      }

      setCache(cacheKey, rawData);
      return rawData as T;
    }
  }

  setCache(cacheKey, rawData);
  return rawData as T;
}

async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`API Error (${response.status}): ${errorText}`);
  }

  try {
    const text = await response.text();
    if (!text.trim()) {
      throw new Error("Empty response body");
    }

    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Failed to parse response: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// タイムアウト付きfetch
async function fetchWithTimeout(
  url: string,
  timeoutMs = CONFIG.REQUEST_TIMEOUT,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const combinedSignal = controller.signal;

  if (signal) {
    const handleExternalAbort = () => controller.abort();
    signal.addEventListener("abort", handleExternalAbort);

    if (signal.aborted) {
      controller.abort();
    }
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: combinedSignal,
      headers: {
        Accept: "application/json",
        "User-Agent": "kuhi-api-mcp-server/1.4.1",
      },
    });
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

async function fetchWithRetry(
  url: string,
  signal?: AbortSignal,
): Promise<Response> {
  let lastError: Error = new Error("No attempts made");

  for (let attempt = 1; attempt <= CONFIG.RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url,
        CONFIG.REQUEST_TIMEOUT,
        signal,
      );
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError.name === "AbortError" || signal?.aborted) {
        throw lastError;
      }

      if (attempt === CONFIG.RETRY_ATTEMPTS) {
        break;
      }

      const delay = Math.min(1000 * 2 ** (attempt - 1), 5000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(
    `Failed after ${CONFIG.RETRY_ATTEMPTS} attempts: ${lastError.message}`,
  );
}

function safeArrayAccess<T>(
  array: readonly T[] | undefined,
  index: number,
): T | undefined {
  return array && array.length > index ? array[index] : undefined;
}

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

// API Functions
async function fetchMonuments(options?: SearchOptions): Promise<Monument[]> {
  const params = options
    ? Object.fromEntries(
        Object.entries(options)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, String(value)]),
      )
    : undefined;

  const raw = await fetchResource(
    ENDPOINTS.MONUMENTS,
    MonumentsResponseSchema,
    undefined,
    params,
  );
  return raw.map(normalizeMonument);
}

async function fetchMonumentById(id: number): Promise<Monument> {
  const raw = await fetchResource(ENDPOINTS.MONUMENTS, MonumentSchema, id);
  return normalizeMonument(raw);
}

async function fetchPoets(options?: Partial<SearchOptions>): Promise<Poet[]> {
  const params = options
    ? Object.fromEntries(
        Object.entries(options)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, String(value)]),
      )
    : undefined;

  const raw = await fetchResource(
    ENDPOINTS.POETS,
    PoetsResponseSchema,
    undefined,
    params,
  );
  return raw.map(normalizePoet);
}

async function fetchPoetById(id: number): Promise<Poet> {
  const data = await fetchResource(ENDPOINTS.POETS, PoetSchema, id);
  return normalizePoet(data);
}

async function fetchHaikuMonumentsByPoet(
  poetId: number,
): Promise<Monument[]> {
  const data = await fetchResource(
    `${ENDPOINTS.POETS}/${poetId}/monuments`,
    z.array(MonumentSchema),
  );
  return data.map(normalizeMonument);
}

async function fetchSources(
  options?: Partial<SearchOptions>,
): Promise<Source[]> {
  const params = options
    ? Object.fromEntries(
        Object.entries(options)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, String(value)]),
      )
    : undefined;

  const raw = await fetchResource(
    ENDPOINTS.SOURCES,
    z.array(SourceSchema),
    undefined,
    params,
  );
  return raw.map(normalizeSource);
}

async function fetchSourceById(id: number): Promise<Source> {
  const raw = await fetchResource(ENDPOINTS.SOURCES, SourceSchema, id);
  return normalizeSource(raw);
}

async function fetchLocations(
  options?: Partial<SearchOptions>,
): Promise<Location[]> {
  const params = options
    ? Object.fromEntries(
        Object.entries(options)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, String(value)]),
      )
    : undefined;

  const data = await fetchResource(
    ENDPOINTS.LOCATIONS,
    z.array(LocationSchema),
    undefined,
    params,
  );
  return data.map(transformZodToLocation);
}

async function fetchLocationById(id: number): Promise<Location> {
  const data = await fetchResource(ENDPOINTS.LOCATIONS, LocationSchema, id);
  return transformZodToLocation(data);
}

async function fetchHaikuMonumentsByRegion(
  region: string,
): Promise<Monument[]> {
  const data = await fetchResource(
    ENDPOINTS.MONUMENTS,
    MonumentsResponseSchema,
    undefined,
    { region },
  );
  return data.map(normalizeMonument);
}

async function countHaikuMonumentsByPrefecture(
  prefecture: string,
): Promise<number> {
  const data = await fetchResource(
    ENDPOINTS.MONUMENTS,
    MonumentsResponseSchema,
    undefined,
    { prefecture },
  );
  return data.length;
}

async function fetchHaikuMonumentsByCoordinates(
  lat: number,
  lon: number,
  radius: number,
): Promise<Monument[]> {
  if (!validateCoordinates(lat, lon)) {
    throw new Error(
      "Invalid coordinates: latitude must be between -90 and 90, longitude must be between -180 and 180",
    );
  }
  if (radius <= 0) {
    throw new Error("Invalid radius: radius must be greater than 0");
  }

  const data = await fetchResource(
    ENDPOINTS.MONUMENTS,
    MonumentsResponseSchema,
    undefined,
    { lat: lat.toString(), lon: lon.toString(), radius: radius.toString() },
  );
  return data.map(normalizeMonument);
}

function convertToGeoJSON(monuments: Monument[]): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = monuments
    .filter((monument) => monument.locations && monument.locations.length > 0)
    .map((monument) => {
      const location = safeArrayAccess(monument.locations, 0);
      const poet = safeArrayAccess(monument.poets, 0);
      const inscription = safeArrayAccess(monument.inscriptions, 0);
      const poem = safeArrayAccess(inscription?.poems, 0);
      const media = safeArrayAccess(monument.media, 0);

      if (
        !location ||
        location.longitude == null ||
        location.latitude == null
      ) {
        throw new Error(`Monument ${monument.id} has invalid location data`);
      }

      const coordinates: [number, number] = [location.longitude, location.latitude];
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: coordinates,
        },
        properties: {
          id: monument.id,
          inscription: poem?.text || inscription?.original_text || "",
          canonical_name: monument.canonical_name,
          commentary: inscription?.notes ?? null,
          media_url: media?.url ?? null,
          poet_name: poet?.name ?? "不明",
          prefecture: location.prefecture ?? null,
          region: location.region ?? null,
          address: location.address ?? null,
          place_name: location.place_name ?? null,
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

// 統計・分析関数
async function getHaikuMonumentsStatistics(): Promise<{
  total: number;
  byPrefecture: Record<string, number>;
  byRegion: Record<string, number>;
  byPoet: Record<string, number>;
  bySeason: Record<string, number>;
}> {
  const monuments = await fetchMonuments();

  const byPrefecture: Record<string, number> = {};
  const byRegion: Record<string, number> = {};
  const byPoet: Record<string, number> = {};
  const bySeason: Record<string, number> = {};

  for (const monument of monuments) {
    const location = safeArrayAccess(monument.locations, 0);
    const poet = safeArrayAccess(monument.poets, 0);
    const inscription = safeArrayAccess(monument.inscriptions, 0);
    const poem = safeArrayAccess(inscription?.poems, 0);

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
    if (poem?.season) {
      bySeason[poem.season] = (bySeason[poem.season] || 0) + 1;
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
): Promise<Monument[]> {
  const searchOptions: SearchOptions = {
    search: searchText,
    limit,
  };
  return await fetchMonuments(searchOptions);
}

async function getMonumentsBySeasonAndRegion(
  season: string,
  region?: string,
): Promise<Monument[]> {
  const monuments = await fetchMonuments();

  return monuments.filter((monument) => {
    const inscription = safeArrayAccess(monument.inscriptions, 0);
    const poem = safeArrayAccess(inscription?.poems, 0);
    const matchesSeason = poem?.season === season;
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

// 監視・ヘルスチェック関数
function getValidationMetrics(): ValidationMetrics & {
  successRate: number;
  isHealthy: boolean;
} {
  const successRate =
    validationMetrics.totalRequests > 0
      ? (validationMetrics.totalRequests -
          validationMetrics.validationFailures) /
        validationMetrics.totalRequests
      : 1.0;

  const isHealthy = successRate >= 0.95;

  return {
    ...validationMetrics,
    successRate,
    isHealthy,
  };
}

function logValidationHealth(): void {
  const metrics = getValidationMetrics();

  if (!metrics.isHealthy) {
    logger.error("Validation health check failed", metrics);
  } else {
    logger.info("Validation health check passed", {
      totalRequests: metrics.totalRequests,
      successRate: metrics.successRate,
    });
  }
}

setInterval(logValidationHealth, 5 * 60 * 1000);

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
    const data = await fetchMonuments(searchOptions);
    const formatted = data.map(formatMonumentForDisplay).join("\n\n");
    return {
      content: [
        {
          type: "text",
          text: `句碑データ（${data.length}件）:\n${formatted}`,
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
    const data = await fetchMonumentById(validatedId);
    const formatted = formatMonumentForDisplay(data);
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
    const searchOptions: SearchOptions =
      SearchOptionsSchema.partial().parse(options);

    const data = await fetchMonuments(searchOptions);
    const formatted = data.map(formatMonumentForDisplay).join("\n\n");
    return {
      content: [
        {
          type: "text",
          text: `検索結果（${data.length}件）:\n\n${formatted}`,
        },
      ],
    };
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
    const filteredOptions = Object.fromEntries(
      Object.entries(options).filter(([, value]) => value !== undefined),
    );
    const data = await fetchPoets(filteredOptions);
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
    const filteredOptions = Object.fromEntries(
      Object.entries(options).filter(([, value]) => value !== undefined),
    );
    const data = await fetchSources(filteredOptions);
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
    const filteredOptions = Object.fromEntries(
      Object.entries(options).filter(([, value]) => value !== undefined),
    );
    const data = await fetchLocations(filteredOptions);
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
    const formatted = data.map(formatMonumentForDisplay).join("\n\n");
    return {
      content: [
        {
          type: "text",
          text: `${region}地域の句碑（${data.length}件）:\n\n${formatted}`,
        },
      ],
    };
  },
);

server.tool(
  "count_haiku_monuments_by_prefecture",
  "指定された県の句碑の数を表示",
  { prefecture: z.string().describe("県名") },
  async ({ prefecture }) => {
    const count = await countHaikuMonumentsByPrefecture(prefecture);
    return {
      content: [
        {
          type: "text",
          text: `${prefecture}の句碑数: ${count}基`,
        },
      ],
    };
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
    const monuments = await fetchMonuments();
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

// 型変換ヘルパー関数
function transformZodToLocation(data: unknown): Location {
  const zodData = LocationSchema.parse(data);
  return {
    ...zodData,
    prefecture: zodData.prefecture ?? null,
    region: zodData.region ?? null,
    municipality: zodData.municipality ?? null,
    address: zodData.address ?? null,
    place_name: zodData.place_name ?? null,
    geohash: zodData.geohash ?? null,
    geom_geojson: zodData.geom_geojson ?? null,
    accuracy_m: zodData.accuracy_m ?? null,
    geojson: zodData.geojson ?? null,
  };
}

function normalizePoet(data: unknown): Poet {
  const parsed = PoetSchema.parse(data);
  return {
    ...parsed,
    name_kana: parsed.name_kana ?? null,
    biography: parsed.biography ?? null,
    birth_year: parsed.birth_year ?? null,
    death_year: parsed.death_year ?? null,
    link_url: parsed.link_url ?? null,
    image_url: parsed.image_url ?? null,
  };
}

function normalizeSource(data: unknown): Source {
  const parsed = SourceSchema.parse(data);
  return {
    ...parsed,
    author: parsed.author ?? null,
    title: parsed.title ?? null,
    publisher: parsed.publisher ?? null,
    source_year: parsed.source_year ?? null,
    url: parsed.url ?? null,
  };
}

function normalizeMonument(data: unknown): Monument {
  const parsed = MonumentSchema.parse(data);
  return {
    ...parsed,
    monument_type: parsed.monument_type ?? null,
    monument_type_uri: parsed.monument_type_uri ?? null,
    material: parsed.material ?? null,
    material_uri: parsed.material_uri ?? null,
    inscriptions: parsed.inscriptions?.map((i) => ({
      ...i,
      side: i.side ?? "front",
      original_text: i.original_text ?? null,
      transliteration: i.transliteration ?? null,
      reading: i.reading ?? null,
      language: i.language ?? "ja",
      notes: i.notes ?? null,
      source_id: i.source_id ?? null,
      poems: i.poems?.map((p) => ({
        ...p,
        kigo: p.kigo ?? null,
        season: p.season ?? null,
      })),
      source: i.source ? normalizeSource(i.source) : undefined,
    })) ?? undefined,
    locations: parsed.locations?.map(transformZodToLocation) ?? undefined,
    poets: parsed.poets?.map(normalizePoet) ?? undefined,
    sources: parsed.sources?.map(normalizeSource) ?? undefined,
    original_established_date: parsed.original_established_date ?? null,
    hu_time_normalized: parsed.hu_time_normalized ?? null,
    interval_start: parsed.interval_start ?? null,
    interval_end: parsed.interval_end ?? null,
    uncertainty_note: parsed.uncertainty_note ?? null,
  };
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
