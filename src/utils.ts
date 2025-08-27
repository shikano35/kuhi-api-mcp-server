import type { Monument } from "./schemas.js";

export interface MonumentStatistics {
  readonly total: number;
  readonly byPrefecture: Record<string, number>;
  readonly byRegion: Record<string, number>;
  readonly byPoet: Record<string, number>;
  readonly bySeason: Record<string, number>;
}

const COORDINATE_BOUNDS = {
  LAT_MIN: -90,
  LAT_MAX: 90,
  LON_MIN: -180,
  LON_MAX: 180,
} as const;

const SEASON_MAP: Readonly<Record<string, string>> = {
  春: "春",
  spring: "春",
  はる: "春",
  夏: "夏",
  summer: "夏",
  なつ: "夏",
  秋: "秋",
  autumn: "秋",
  fall: "秋",
  あき: "秋",
  冬: "冬",
  winter: "冬",
  ふゆ: "冬",
} as const;

export function formatMonumentForDisplay(monument: Monument): string {
  const poet = monument.poets?.[0];
  const location = monument.locations?.[0];
  const inscription = monument.inscriptions?.[0];
  const poem = inscription?.poems?.[0];

  return `【句碑ID: ${monument.id}】
名称: ${monument.canonical_name}
俳句: ${poem?.text ?? inscription?.original_text ?? "記載なし"}
俳人: ${poet?.name ?? "不明"}
設置場所: ${location?.prefecture ?? ""} ${location?.region ?? ""} ${location?.address ?? ""}
解説: ${inscription?.notes ?? "なし"}
季語: ${poem?.kigo ?? "なし"}
季節: ${poem?.season ?? "不明"}`;
}

// Legacy compatibility
export function formatHaikuMonumentForDisplay(monument: Monument): string {
  return formatMonumentForDisplay(monument);
}

export function formatStatisticsForDisplay(
  statistics: MonumentStatistics,
): string {
  const formatTopEntries = (entries: readonly [string, number][]): string => {
    return entries.map(([name, count]) => `  ${name}: ${count}基`).join("\n");
  };

  const topPrefectures = Object.entries(statistics.byPrefecture)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const topPoets = Object.entries(statistics.byPoet)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const seasonEntries = Object.entries(statistics.bySeason);
  const regionEntries = Object.entries(statistics.byRegion);

  return `【句碑データベース統計情報】
総句碑数: ${statistics.total}

■都道府県別トップ5:
${formatTopEntries(topPrefectures)}

■俳人別トップ5:
${formatTopEntries(topPoets)}

■季節別分布:
${formatTopEntries(seasonEntries)}

■地域別分布:
${formatTopEntries(regionEntries)}`;
}

export function validateCoordinates(lat: number, lon: number): boolean {
  return (
    lat >= COORDINATE_BOUNDS.LAT_MIN &&
    lat <= COORDINATE_BOUNDS.LAT_MAX &&
    lon >= COORDINATE_BOUNDS.LON_MIN &&
    lon <= COORDINATE_BOUNDS.LON_MAX
  );
}

export function formatDistance(meters: number): string {
  const METERS_PER_KM = 1000;

  if (meters < METERS_PER_KM) {
    return `${Math.round(meters)}m`;
  }

  return `${(meters / METERS_PER_KM).toFixed(1)}km`;
}

export function parseSeasonQuery(query: string): string | null {
  const normalizedQuery = query.toLowerCase();
  return SEASON_MAP[normalizedQuery] ?? null;
}
