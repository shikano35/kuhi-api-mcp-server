import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  fetchAllMonuments,
  fetchLocations,
  fetchMonumentById,
  fetchPoets,
} from "../../api.js";
import type { Location, Monument, SearchOptions } from "../../types.js";

function safeArrayAccess<T>(
  array: readonly T[] | undefined,
  index: number,
): T | undefined {
  return array && array.length > index ? array[index] : undefined;
}

interface ResolvedCoordinates {
  readonly latitude: number;
  readonly longitude: number;
  readonly label?: string;
  readonly prefecture?: string;
  readonly municipality?: string;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function scoreLocationMatch(location: Location, query: string): number {
  const normalizedQuery = query.replace(/\s+/gu, "");
  let score = 0;

  if (location.place_name) {
    const place = location.place_name.replace(/\s+/gu, "");
    if (place && normalizedQuery.includes(place)) {
      score += 5;
    }
  }

  if (location.address?.includes(query)) {
    score += 3;
  }

  if (location.municipality && query.includes(location.municipality)) {
    score += 2;
  }

  if (location.prefecture && query.includes(location.prefecture)) {
    score += 1;
  }

  return score;
}

async function resolveCoordinatesFromQuery(
  query: string,
  prefecture?: string,
): Promise<ResolvedCoordinates | null> {
  const normalized = query.trim();
  if (!normalized) {
    return null;
  }

  const params: Partial<SearchOptions> = {
    search: normalized,
    limit: 10,
  };

  if (prefecture) {
    params.prefecture = prefecture;
  }

  const candidates = await fetchLocations(params).catch(() => []);
  const scored = candidates
    .filter(
      (location) =>
        isFiniteNumber(location.latitude) && isFiniteNumber(location.longitude),
    )
    .map((location) => ({
      location,
      score: scoreLocationMatch(location, normalized),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score <= 0) {
    return null;
  }

  return {
    latitude: best.location.latitude as number,
    longitude: best.location.longitude as number,
    ...(best.location.place_name || best.location.address
      ? {
          label:
            best.location.place_name ?? best.location.address ?? normalized,
        }
      : {}),
    ...(best.location.prefecture
      ? { prefecture: best.location.prefecture }
      : {}),
    ...(best.location.municipality
      ? { municipality: best.location.municipality }
      : {}),
  };
}

function normalizePoetText(value: string): string {
  return value.replace(/[「」『』（）()【】\s・,，、]/gu, "").toLowerCase();
}

function findPoetByFlexibleName(
  poets: readonly { name: string; id: number }[],
  query: string,
) {
  const normalizedQuery = normalizePoetText(query);
  if (!normalizedQuery) {
    return undefined;
  }

  return poets.find((poet) => {
    const normalizedName = normalizePoetText(poet.name);
    return (
      normalizedName === normalizedQuery ||
      normalizedName.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedName)
    );
  });
}

export function registerTourismTools(server: McpServer): void {
  server.registerTool(
    "explore_monuments_for_tourism",
    {
      description: `観光向けの句碑探索を支援します。

このToolは以下のユーザーの意図に対応します：
- 特定の俳人の句碑を観光したい
- 季節に合った句碑を訪れたい
- 地域を絞って効率的に巡りたい

返却データ:
- 句碑の基本情報（名称、場所、句、解説）
- アクセス情報（緯度経度、住所）
- 周辺の関連情報

使用例:
- 松尾芭蕉の句碑を東海地方で3件探す
- 冬の句碑を北陸で観光ルートとして提案
- 山口誓子の句碑を春に訪れたい`,
      inputSchema: z.object({
        poet_name: z
          .string()
          .optional()
          .describe("俳人名（例: 松尾芭蕉、山口誓子）"),
        region: z
          .string()
          .optional()
          .describe("地域名（例: 東海、関東甲信、北陸）"),
        season: z.string().optional().describe("季節（春/夏/秋/冬）"),
        prefecture: z.string().optional().describe("都道府県名（例: 三重県）"),
        municipality: z
          .string()
          .optional()
          .describe("市区町村名（例: 伊勢市）"),
        max_results: z
          .number()
          .default(10)
          .describe("最大取得件数（1-50、デフォルト: 10）"),
      }),
    },
    async ({
      poet_name,
      region,
      season,
      prefecture,
      municipality,
      max_results,
    }) => {
      let results: Monument[] = [];
      if (poet_name) {
        const allPoets = await fetchPoets();
        const poet = findPoetByFlexibleName(allPoets, poet_name);
        if (!poet) {
          return {
            content: [
              {
                type: "text",
                text: `俳人「${poet_name}」が見つかりませんでした。名前を確認してください。`,
              },
            ],
          };
        }
        results = await fetchAllMonuments({ poet_id: poet.id });
      } else {
        results = await fetchAllMonuments();
      }

      let filtered = results;

      // 都道府県フィルタ
      if (prefecture) {
        filtered = filtered.filter((m) =>
          m.locations?.some((l) => l.prefecture === prefecture),
        );
      }
      // 地域フィルタ
      if (region) {
        filtered = filtered.filter((m) =>
          m.locations?.some((l) => l.region === region),
        );
      }
      // 市区町村フィルタ
      if (municipality) {
        filtered = filtered.filter((m) =>
          m.locations?.some((l) => l.municipality?.includes(municipality)),
        );
      }
      // 季節フィルタ
      if (season) {
        filtered = filtered.filter((m) =>
          m.inscriptions?.some((i) =>
            i.poems?.some((p) => p.season === season),
          ),
        );
      }

      const limited =
        typeof max_results === "number" && Number.isFinite(max_results)
          ? filtered.slice(0, max_results)
          : filtered;

      if (limited.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "指定された条件に一致する句碑が見つかりませんでした。",
            },
          ],
        };
      }

      const formatted = limited
        .map((m, index) => {
          const location = safeArrayAccess(m.locations, 0);
          const poet = safeArrayAccess(m.poets, 0);
          const inscription = safeArrayAccess(m.inscriptions, 0);
          const poem = safeArrayAccess(inscription?.poems, 0);

          return `## ${index + 1}. ${m.canonical_name}

**俳句**: ${poem?.text || inscription?.original_text || "不明"}
**俳人**: ${poet?.name || "不明"}

**所在地**:
- 都道府県: ${location?.prefecture || "不明"}
- 市区町村: ${location?.municipality || "不明"}
- 場所: ${location?.place_name || "不明"}
- 住所: ${location?.address || "詳細不明"}
- 座標: ${location?.latitude ? `${location.latitude}, ${location.longitude}` : "不明"}

**詳細情報**:
- 季語: ${poem?.kigo || "なし"}
- 季節: ${poem?.season || "不明"}
- 解説: ${inscription?.notes || "（解説なし）"}

---`;
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `# 観光向け句碑情報（${filtered.length}件）\n\n${formatted}\n\n観光のヒント:\n- 地図アプリで座標を検索すると正確な場所がわかります\n- 複数の句碑を巡る場合は、地域ごとにまとめると効率的です\n- 季節の句碑を訪れると、その情景をより深く感じられます`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "learn_about_monument",
    {
      description: `特定の句碑について深く理解するための詳細情報を提供します。

このToolは以下のユーザーの意図に対応します：
- 句碑の背景や歴史を知りたい
- 俳人の作品について学びたい
- 句碑の設置経緯や意義を理解したい

返却データ:
- 句碑の全詳細情報
- 関連する俳人の情報
- 碑文の解説と背景
- 設置場所の詳細情報

注意: このToolは句碑IDが必要です。句碑名や場所から探す場合は、先に explore_monuments_for_tourism を使用してIDを特定してください。

使用例:
- 「本統寺 句碑（松尾芭蕉）」の詳細が知りたい場合、まず explore_monuments_for_tourism で検索してIDを取得
- IDが判明している場合（例: monument_id=1）の詳細情報取得`,
      inputSchema: z.object({
        monument_id: z
          .number()
          .describe(
            "句碑ID（数値）。IDが不明な場合は explore_monuments_for_tourism で先に検索してください",
          ),
      }),
    },
    async ({ monument_id }) => {
      const monument = await fetchMonumentById(monument_id);

      const location = safeArrayAccess(monument.locations, 0);
      const poet = safeArrayAccess(monument.poets, 0);
      const inscription = safeArrayAccess(monument.inscriptions, 0);
      const poem = safeArrayAccess(inscription?.poems, 0);
      const event = safeArrayAccess(monument.events, 0);
      const media = safeArrayAccess(monument.media, 0);
      const source = safeArrayAccess(monument.sources, 0);

      const formatted = `# ${monument.canonical_name}

## 基本情報
- **句碑ID**: ${monument.id}
- **種別**: ${monument.monument_type || "不明"}
- **素材**: ${monument.material || "不明"}

## 俳句
**碑文**: ${poem?.text || inscription?.original_text || "不明"}

**季語**: ${poem?.kigo || "なし"}
**季節**: ${poem?.season || "不明"}

## 俳人情報
**名前**: ${poet?.name || "不明"}
${poet?.name_kana ? `**読み**: ${poet.name_kana}` : ""}
${poet?.biography ? `**経歴**: ${poet.biography}` : ""}
${poet?.birth_year || poet?.death_year ? `**生没年**: ${poet.birth_year || "?"} - ${poet.death_year || "?"}` : ""}
${poet?.link_url ? `**詳細リンク**: ${poet.link_url}` : ""}

## 解説・背景
${inscription?.notes || "（解説なし）"}

## 設置場所
${
  location
    ? `
- **都道府県**: ${location.prefecture || "不明"}
- **地域**: ${location.region || "不明"}
- **市区町村**: ${location.municipality || "不明"}
- **場所名**: ${location.place_name || "不明"}
- **住所**: ${location.address || "詳細不明"}
- **緯度経度**: ${location.latitude}, ${location.longitude}
- **Geohash**: ${location.geohash || "なし"}
`
    : "設置場所情報なし"
}

## 建立情報
${
  event
    ? `
- **建立年月**: ${event.interval_start || "不明"}
- **建立者**: ${event.actor || "不明"}
${event.uncertainty_note ? `- **備考**: ${event.uncertainty_note}` : ""}
`
    : "建立情報なし"
}

## メディア
${
  media
    ? `
- **種類**: ${media.media_type}
- **URL**: ${media.url}
${media.photographer ? `- **撮影者**: ${media.photographer}` : ""}
${media.license ? `- **ライセンス**: ${media.license}` : ""}
`
    : "画像・映像情報なし"
}

## 出典
${
  source
    ? `
- **引用**: ${source.citation}
- **著者**: ${source.author || "不明"}
- **出版社**: ${source.publisher || "不明"}
- **発行年**: ${source.source_year || "不明"}
${source.url ? `- **URL**: ${source.url}` : ""}
`
    : "出典情報なし"
}

---

さらに詳しく調べる:
- 俳人の他の作品を見たい場合: explore_monuments_for_tourism で俳人名を指定
- 周辺の句碑を探したい場合: discover_nearby_monuments で座標を指定`;

      return {
        content: [
          {
            type: "text",
            text: formatted,
          },
        ],
      };
    },
  );

  server.registerTool(
    "discover_nearby_monuments",
    {
      description: `現在地や指定した場所の周辺にある句碑を発見します。

このToolは以下のユーザーの意図に対応します：
- 今いる場所の近くにある句碑を見つけたい
- 特定の地点から近い順に句碑を探したい
- 旅行先で偶然句碑を見つけて周辺も探したい

返却データ:
- 周辺の句碑一覧（距離順）
- 各句碑までの距離
- 簡潔なアクセス情報

使用例:
- 緯度35.065502、経度136.692193の周辺1km以内の句碑
- 桑名市周辺の句碑を探す（座標で指定）`,
      inputSchema: z.object({
        latitude: z
          .number()
          .min(-90)
          .max(90)
          .optional()
          .describe("緯度（-90〜90）"),
        longitude: z
          .number()
          .min(-180)
          .max(180)
          .optional()
          .describe("経度（-180〜180）"),
        radius_meters: z
          .number()
          .default(1000)
          .describe("検索半径（メートル、デフォルト: 1000m）"),
        max_results: z
          .number()
          .default(5)
          .describe("最大取得件数（デフォルト: 5件）"),
        prefecture: z
          .string()
          .optional()
          .describe(
            "都道府県で絞り込み（例: 三重県）。指定すると検索が高速化されます",
          ),
        place_query: z
          .string()
          .optional()
          .describe("地点名やランドマーク（例: 金沢駅、兼六園）"),
      }),
    },
    async ({
      latitude,
      longitude,
      radius_meters = 1000,
      max_results = 5,
      prefecture,
      place_query,
    }) => {
      try {
        let centerLatitude = latitude;
        let centerLongitude = longitude;
        let resolvedLabel: string | undefined;

        if (
          (!isFiniteNumber(centerLatitude) ||
            !isFiniteNumber(centerLongitude)) &&
          place_query
        ) {
          const resolved = await resolveCoordinatesFromQuery(
            place_query,
            prefecture,
          );
          if (resolved) {
            centerLatitude = resolved.latitude;
            centerLongitude = resolved.longitude;
            resolvedLabel = resolved.label;
            prefecture = prefecture ?? resolved.prefecture ?? prefecture;
          } else {
            throw new Error(
              `指定された場所「${place_query}」を特定できませんでした。緯度・経度を直接入力してください。`,
            );
          }
        }

        if (
          !isFiniteNumber(centerLatitude) ||
          !isFiniteNumber(centerLongitude)
        ) {
          throw new Error(
            "緯度・経度、もしくは地点名(place_query)を指定してください",
          );
        }

        if (centerLatitude < -90 || centerLatitude > 90) {
          throw new Error("緯度は-90から90の範囲で指定してください");
        }
        if (centerLongitude < -180 || centerLongitude > 180) {
          throw new Error("経度は-180から180の範囲で指定してください");
        }
        if (radius_meters <= 0) {
          throw new Error("半径は正の数で指定してください");
        }

        const fetchOptions = prefecture ? { prefecture } : undefined;
        const allMonuments = await fetchAllMonuments(fetchOptions);

        const toRadians = (deg: number) => (deg * Math.PI) / 180;
        const EARTH_RADIUS = 6371000;

        interface MonumentWithDistance {
          monument: Monument;
          distance: number;
        }

        const calculateDistance = (
          lat1: number,
          lon1: number,
          lat2: number,
          lon2: number,
        ): number => {
          const dLat = toRadians(lat2 - lat1);
          const dLon = toRadians(lon2 - lon1);
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) *
              Math.cos(toRadians(lat2)) *
              Math.sin(dLon / 2) *
              Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return EARTH_RADIUS * c;
        };

        const nearby: MonumentWithDistance[] = [];
        for (const monument of allMonuments) {
          const location = safeArrayAccess(monument.locations, 0);
          if (!location?.latitude || !location?.longitude) continue;

          const distance = calculateDistance(
            centerLatitude,
            centerLongitude,
            location.latitude,
            location.longitude,
          );

          if (distance <= radius_meters) {
            nearby.push({ monument, distance });
          }
        }

        nearby.sort((a, b) => a.distance - b.distance);

        const limited = nearby.slice(0, max_results);

        if (limited.length === 0) {
          const centerDescription =
            resolvedLabel ??
            place_query ??
            `緯度${centerLatitude}, 経度${centerLongitude}`;

          return {
            content: [
              {
                type: "text",
                text: `指定された地点（${centerDescription}）から半径${radius_meters}m以内に句碑は見つかりませんでした。\n\n半径を広げて再検索してください。`,
              },
            ],
          };
        }

        const centerDescription =
          resolvedLabel ??
          place_query ??
          `緯度 ${centerLatitude}, 経度 ${centerLongitude}`;

        const formatted = limited
          .map((item, index) => {
            const m = item.monument;
            const location = safeArrayAccess(m.locations, 0);
            const poet = safeArrayAccess(m.poets, 0);
            const inscription = safeArrayAccess(m.inscriptions, 0);
            const poem = safeArrayAccess(inscription?.poems, 0);

            const distanceKm =
              item.distance < 1000
                ? `${Math.round(item.distance)}m`
                : `${(item.distance / 1000).toFixed(1)}km`;

            return `## ${index + 1}. ${m.canonical_name} 【距離: ${distanceKm}】

**俳句**: ${poem?.text || inscription?.original_text || "不明"}
**俳人**: ${poet?.name || "不明"}
**場所**: ${location?.place_name || "不明"}（${location?.prefecture || ""}${location?.municipality || ""}）
**座標**: ${location?.latitude}, ${location?.longitude}

---`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `# 周辺の句碑（${limited.length}件）

基準地点: ${centerDescription}
検索半径: ${radius_meters}m

${formatted}

ナビゲーションのヒント:
- 各句碑の座標をGoogle Mapsなどに入力すると、ルート案内が表示されます
- 近い順に並んでいるので、効率的に巡ることができます`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `エラー: ${errorMessage}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "analyze_monuments_statistics",
    {
      description: `句碑データベースの包括的な統計分析を提供します。

このToolは以下のユーザーの意図に対応します：
- データベース全体の句碑分布を把握したい
- 都道府県別・地域別の句碑数を知りたい
- 俳人別・季節別の傾向を分析したい
- 観光計画の参考として統計データが欲しい

返却データ:
- 総句碑数
- 都道府県別の句碑数（上位10件）
- 地域別の句碑数
- 俳人別の句碑数（上位10件）
- 季節別の句碑数

使用例:
- どの地域に句碑が多いか調べる
- 春の句碑が多い都道府県を見つける
- 特定の俳人の作品数を確認する`,
      inputSchema: z.object({
        format: z
          .enum(["summary", "detailed"])
          .default("summary")
          .describe("表示形式: summary=要約, detailed=詳細"),
      }),
    },
    async ({ format }) => {
      const monuments = await fetchAllMonuments();

      const byPrefecture: Record<string, number> = {};
      const byRegion: Record<string, number> = {};
      const byPoet: Record<string, number> = {};
      const bySeason: Record<string, number> = {};

      for (const monument of monuments) {
        const location = safeArrayAccess(monument.locations, 0);
        const poet = safeArrayAccess(monument.poets, 0);
        const inscription = safeArrayAccess(monument.inscriptions, 0);
        const poem = safeArrayAccess(inscription?.poems, 0);

        if (location?.prefecture) {
          byPrefecture[location.prefecture] =
            (byPrefecture[location.prefecture] || 0) + 1;
        }

        if (location?.region) {
          byRegion[location.region] = (byRegion[location.region] || 0) + 1;
        }

        if (poet?.name) {
          byPoet[poet.name] = (byPoet[poet.name] || 0) + 1;
        }

        if (poem?.season) {
          bySeason[poem.season] = (bySeason[poem.season] || 0) + 1;
        }
      }

      const sortedPrefectures = Object.entries(byPrefecture)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

      const sortedPoets = Object.entries(byPoet)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

      const sortedRegions = Object.entries(byRegion).sort(
        ([, a], [, b]) => b - a,
      );

      const sortedSeasons = Object.entries(bySeason).sort(
        ([, a], [, b]) => b - a,
      );

      if (format === "summary") {
        const summary = `# 句碑データベース統計（要約）

## 基本情報
- **総句碑数**: ${monuments.length}基

## 地域分布（上位5件）
${sortedPrefectures
  .slice(0, 5)
  .map(([name, count], i) => `${i + 1}. ${name}: ${count}基`)
  .join("\n")}

## 俳人（上位5件）
${sortedPoets
  .slice(0, 5)
  .map(([name, count], i) => `${i + 1}. ${name}: ${count}基`)
  .join("\n")}

## 季節分布
${sortedSeasons.map(([season, count]) => `- ${season}: ${count}基`).join("\n")}

詳細データが必要な場合は、format="detailed"を指定してください。`;

        return {
          content: [{ type: "text", text: summary }],
        };
      }

      const detailed = `# 句碑データベース統計（詳細）

## 基本情報
- **総句碑数**: ${monuments.length}基

---

## 都道府県別句碑数（上位10件）
${sortedPrefectures.map(([name, count], i) => `${i + 1}. ${name}: ${count}基`).join("\n")}

---

## 地域別句碑数
${sortedRegions.map(([region, count]) => `- ${region}: ${count}基`).join("\n")}

---

## 俳人別句碑数（上位10件）
${sortedPoets.map(([name, count], i) => `${i + 1}. ${name}: ${count}基`).join("\n")}

---

## 季節別句碑数
${sortedSeasons.map(([season, count]) => `- ${season}: ${count}基`).join("\n")}

---

## 活用のヒント
- 特定地域の句碑を探すには「explore_monuments_for_tourism」を使用
- 俳人の詳細情報は「learn_about_monument」で確認
- 周辺の句碑検索は「discover_nearby_monuments」を活用`;

      return {
        content: [{ type: "text", text: detailed }],
      };
    },
  );

  server.registerTool(
    "compare_poets_styles",
    {
      description: `複数の俳人の作風や特徴を比較分析します。

このToolは以下のユーザーの意図に対応します：
- 複数の俳人のスタイルの違いを知りたい
- 季語や季節の使い方の傾向を比較したい
- 地域的な活動範囲を比較したい
- どの俳人の句碑を巡るか決めたい

返却データ:
- 各俳人の句碑数
- 季節別の句の分布
- 主な活動地域（都道府県）
- 代表的な季語
- スタイルの特徴（簡潔な説明）

使用例:
- 松尾芭蕉と与謝蕪村の作風を比較
- 山口誓子と久保田万太郎の季語の違いを調べる
- 東海地方で活動した俳人を比較`,
      inputSchema: z.object({
        poet_names: z
          .array(z.string())
          .min(2)
          .max(5)
          .describe("比較する俳人名の配列（2-5名）"),
      }),
    },
    async ({ poet_names }) => {
      const allPoets = await fetchPoets();
      const results: Array<{
        name: string;
        monumentCount: number;
        seasonDistribution: Record<string, number>;
        prefectures: Record<string, number>;
        topKigo: string[];
        biography?: string;
      }> = [];

      for (const poetName of poet_names) {
        const poet = allPoets.find((p) => p.name.includes(poetName));
        if (!poet) {
          results.push({
            name: poetName,
            monumentCount: 0,
            seasonDistribution: {},
            prefectures: {},
            topKigo: [],
            biography: "（俳人が見つかりませんでした）",
          });
          continue;
        }

        const poetMonuments = await fetchAllMonuments({ poet_id: poet.id });

        const seasonDist: Record<string, number> = {};
        const prefDist: Record<string, number> = {};
        const kigoCount: Record<string, number> = {};

        for (const monument of poetMonuments) {
          const inscription = safeArrayAccess(monument.inscriptions, 0);
          const poem = safeArrayAccess(inscription?.poems, 0);
          const location = safeArrayAccess(monument.locations, 0);

          if (poem?.season) {
            seasonDist[poem.season] = (seasonDist[poem.season] || 0) + 1;
          }

          if (poem?.kigo) {
            const kigos = poem.kigo.split(",");
            for (const k of kigos) {
              const trimmed = k.trim();
              if (trimmed) {
                kigoCount[trimmed] = (kigoCount[trimmed] || 0) + 1;
              }
            }
          }

          if (location?.prefecture) {
            prefDist[location.prefecture] =
              (prefDist[location.prefecture] || 0) + 1;
          }
        }

        const topKigo = Object.entries(kigoCount)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([k]) => k);

        results.push({
          name: poet.name,
          monumentCount: poetMonuments.length,
          seasonDistribution: seasonDist,
          prefectures: prefDist,
          topKigo,
          ...(poet.biography ? { biography: poet.biography } : {}),
        });
      }

      const comparison = `# 俳人スタイル比較分析

${results
  .map(
    (r, index) => `
## ${index + 1}. ${r.name}

**句碑数**: ${r.monumentCount}基

**季節分布**:
${
  Object.keys(r.seasonDistribution).length > 0
    ? Object.entries(r.seasonDistribution)
        .sort(([, a], [, b]) => b - a)
        .map(
          ([season, count]) =>
            `- ${season}: ${count}首 (${Math.round((count / r.monumentCount) * 100)}%)`,
        )
        .join("\n")
    : "（季節データなし）"
}

**主な活動地域**:
${
  Object.keys(r.prefectures).length > 0
    ? Object.entries(r.prefectures)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([pref, count]) => `- ${pref}: ${count}基`)
        .join("\n")
    : "（地域データなし）"
}

**代表的な季語**: ${r.topKigo.length > 0 ? r.topKigo.join("、") : "（データなし）"}

**人物紹介**: ${r.biography || "（情報なし）"}

---`,
  )
  .join("\n")}

## 比較サマリー

${results
  .map((r) => {
    const dominantSeason = Object.entries(r.seasonDistribution).sort(
      ([, a], [, b]) => b - a,
    )[0];
    const mainRegion = Object.entries(r.prefectures).sort(
      ([, a], [, b]) => b - a,
    )[0];

    return `**${r.name}**: ${r.monumentCount}基、${dominantSeason ? `${dominantSeason[0]}の句が多い` : "季節不明"}、${mainRegion ? `${mainRegion[0]}を中心に活動` : "地域不明"}`;
  })
  .join("\n")}

## 活用のヒント
- 特定の俳人の句碑を巡るには「explore_monuments_for_tourism」を使用
- 季節や地域で絞り込むには「discover_nearby_monuments」を活用`;

      return {
        content: [{ type: "text", text: comparison }],
      };
    },
  );
}
