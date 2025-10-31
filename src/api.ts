import { z } from "zod";
import { CONFIG, ENDPOINTS } from "./config.js";
import {
  LocationSchema,
  MonumentSchema,
  MonumentsResponseSchema,
  PoetSchema,
  PoetsResponseSchema,
  SourceSchema,
} from "./schemas.js";
import type {
  InscriptionsResponse,
  Location,
  Monument,
  PoemsResponse,
  Poet,
  SearchOptions,
  Source,
} from "./types.js";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  size: number;
  lastAccessed: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB
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

  if (Date.now() - entry.timestamp > CONFIG.CACHE_DURATION) {
    cache.delete(key);
    currentCacheSize -= entry.size;
    return null;
  }

  entry.lastAccessed = Date.now();
  return entry.data as T;
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
      cache.delete(oldestKey);
      currentCacheSize -= oldEntry.size;
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

export function getValidationMetrics(): ValidationMetrics & {
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

export function buildApiUrl(
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
        "User-Agent": "kuhi-api-mcp-server/2.0.0",
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

interface FetchResourceOptions {
  skipValidation?: boolean;
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
    } catch (_error) {
      validationMetrics.validationFailures += 1;
      validationMetrics.lastFailureAt = new Date();
      validationMetrics.failuresByEndpoint[endpoint] =
        (validationMetrics.failuresByEndpoint[endpoint] ?? 0) + 1;

      setCache(cacheKey, rawData);
      return rawData as T;
    }
  }

  setCache(cacheKey, rawData);
  return rawData as T;
}

export function normalizePoet(data: unknown): Poet {
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

export function normalizeSource(data: unknown): Source {
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

export function normalizeLocation(data: unknown): Location {
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

export function normalizeMonument(data: unknown): Monument {
  const parsed = MonumentSchema.parse(data);
  return {
    ...parsed,
    monument_type: parsed.monument_type ?? null,
    monument_type_uri: parsed.monument_type_uri ?? null,
    material: parsed.material ?? null,
    material_uri: parsed.material_uri ?? null,
    inscriptions:
      parsed.inscriptions?.map((i) => ({
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
    locations: parsed.locations?.map(normalizeLocation) ?? undefined,
    poets: parsed.poets?.map(normalizePoet) ?? undefined,
    sources: parsed.sources?.map(normalizeSource) ?? undefined,
    original_established_date: parsed.original_established_date ?? null,
    hu_time_normalized: parsed.hu_time_normalized ?? null,
    interval_start: parsed.interval_start ?? null,
    interval_end: parsed.interval_end ?? null,
    uncertainty_note: parsed.uncertainty_note ?? null,
  };
}

export async function fetchMonuments(
  options?: SearchOptions,
): Promise<Monument[]> {
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

export async function fetchAllMonuments(
  options?: Omit<SearchOptions, "limit" | "offset">,
  maxResults?: number,
): Promise<Monument[]> {
  const allMonuments: Monument[] = [];
  const seenIds = new Set<number>();
  const BATCH_SIZE = 100;
  const DELAY_MS = 100;
  let offset = 0;
  const DEFAULT_MAX_RESULTS =
    maxResults !== undefined ? maxResults : Number.POSITIVE_INFINITY;

  while (true) {
    const params = {
      ...options,
      limit: BATCH_SIZE,
      offset,
    };
    const batch = await fetchMonuments(params);
    if (!batch.length) {
      break;
    }
    for (const m of batch) {
      if (!seenIds.has(m.id)) {
        allMonuments.push(m);
        seenIds.add(m.id);
      }
    }
    if (allMonuments.length >= DEFAULT_MAX_RESULTS) {
      break;
    }
    if (batch.length < BATCH_SIZE) {
      break;
    }
    offset += BATCH_SIZE;
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    if (offset > 100000) {
      break;
    }
  }
  return allMonuments;
}

export async function fetchMonumentById(id: number): Promise<Monument> {
  const raw = await fetchResource(ENDPOINTS.MONUMENTS, MonumentSchema, id);
  return normalizeMonument(raw);
}

export async function fetchPoets(
  options?: Partial<SearchOptions>,
): Promise<Poet[]> {
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

export async function fetchPoetById(id: number): Promise<Poet> {
  const data = await fetchResource(ENDPOINTS.POETS, PoetSchema, id);
  return normalizePoet(data);
}

export async function fetchHaikuMonumentsByPoet(
  poetId: number,
): Promise<Monument[]> {
  const data = await fetchResource<Monument[]>(
    `${ENDPOINTS.POETS}/${poetId}/monuments`,
    undefined,
    undefined,
    undefined,
    { skipValidation: true },
  );
  return data;
}

export async function fetchSources(
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

export async function fetchSourceById(id: number): Promise<Source> {
  const raw = await fetchResource(ENDPOINTS.SOURCES, SourceSchema, id);
  return normalizeSource(raw);
}

export async function fetchLocations(
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
  return data.map(normalizeLocation);
}

export async function fetchLocationById(id: number): Promise<Location> {
  const data = await fetchResource(ENDPOINTS.LOCATIONS, LocationSchema, id);
  return normalizeLocation(data);
}

export async function fetchPoems(
  options?: Partial<SearchOptions>,
): Promise<PoemsResponse["poems"]> {
  const params = options
    ? Object.fromEntries(
        Object.entries(options)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, String(value)]),
      )
    : undefined;

  const data = await fetchResource<PoemsResponse>(
    ENDPOINTS.POEMS,
    undefined,
    undefined,
    params,
    { skipValidation: true },
  );

  return data.poems;
}

export async function fetchInscriptions(
  options?: Partial<SearchOptions>,
): Promise<InscriptionsResponse["inscriptions"]> {
  const params = options
    ? Object.fromEntries(
        Object.entries(options)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [key, String(value)]),
      )
    : undefined;

  const data = await fetchResource<InscriptionsResponse>(
    ENDPOINTS.INSCRIPTIONS,
    undefined,
    undefined,
    params,
    { skipValidation: true },
  );
  return data.inscriptions;
}
