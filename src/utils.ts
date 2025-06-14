import type { HaikuMonument } from "./types.js";

export function formatHaikuMonumentForDisplay(monument: HaikuMonument): string {
  const poet = monument.poets[0];
  const location = monument.locations[0];
  
  return `【句碑ID: ${monument.id}】
句: ${monument.inscription}
俳人: ${poet?.name || "不明"}
設置場所: ${location?.prefecture || ""} ${location?.region || ""} ${location?.address || ""}
建立日: ${monument.established_date}
解説: ${monument.commentary || "なし"}
季語: ${monument.kigo || "なし"}
季節: ${monument.season || "不明"}`;
}

export function formatStatisticsForDisplay(statistics: {
  total: number;
  byPrefecture: Record<string, number>;
  byRegion: Record<string, number>;
  byPoet: Record<string, number>;
  bySeason: Record<string, number>;
}): string {
  const topPrefectures = Object.entries(statistics.byPrefecture)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
    
  const topPoets = Object.entries(statistics.byPoet)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return `【句碑データベース統計情報】
総句碑数: ${statistics.total}

■都道府県別トップ5:
${topPrefectures.map(([name, count]) => `  ${name}: ${count}基`).join('\n')}

■俳人別トップ5:
${topPoets.map(([name, count]) => `  ${name}: ${count}基`).join('\n')}

■季節別分布:
${Object.entries(statistics.bySeason).map(([season, count]) => `  ${season}: ${count}基`).join('\n')}

■地域別分布:
${Object.entries(statistics.byRegion).map(([region, count]) => `  ${region}: ${count}基`).join('\n')}`;
}

export function validateCoordinates(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

export function parseSeasonQuery(query: string): string | null {
  const seasonMap: Record<string, string> = {
    '春': '春',
    'spring': '春',
    'はる': '春',
    '夏': '夏',
    'summer': '夏',
    'なつ': '夏',
    '秋': '秋',
    'autumn': '秋',
    'fall': '秋',
    'あき': '秋',
    '冬': '冬',
    'winter': '冬',
    'ふゆ': '冬',
  };
  
  return seasonMap[query.toLowerCase()] || null;
}
