export const CONFIG = {
  API_BASE_URL: "https://api.kuhiapi.com",
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 1000,
  REQUEST_TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  CACHE_DURATION: 300000,
} as const;

export const ENDPOINTS = {
  HAIKU_MONUMENTS: "/haiku-monuments",
  POETS: "/poets",
  SOURCES: "/sources",
  LOCATIONS: "/locations",
} as const;

export type Config = typeof CONFIG;
export type Endpoints = typeof ENDPOINTS;