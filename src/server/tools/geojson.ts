import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchMonuments } from "../../api.js";
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  Monument,
  SearchOptions,
} from "../../types.js";

function safeArrayAccess<T>(
  array: readonly T[] | undefined,
  index: number,
): T | undefined {
  return array && array.length > index ? array[index] : undefined;
}

export function convertToGeoJSON(
  monuments: Monument[],
): GeoJSONFeatureCollection {
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

      const coordinates: [number, number] = [
        location.longitude,
        location.latitude,
      ];
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

export function registerGeoJSONTools(server: McpServer): void {
  server.registerTool(
    "get_haiku_monuments_geojson",
    {
      description:
        "句碑データベースに登録されている句碑の情報をGeoJSON形式で表示",
      inputSchema: z.object({
        prefecture: z
          .string()
          .optional()
          .describe("都道府県名で絞り込み（例: 三重県）"),
        municipality: z
          .string()
          .optional()
          .describe("市区町村名で絞り込み（例: 桑名市）"),
        region: z.string().optional().describe("地域名で絞り込み（例: 東海）"),
        poet_name: z
          .string()
          .optional()
          .describe("俳人名で絞り込み（例: 松尾芭蕉）"),
        limit: z
          .number()
          .optional()
          .default(50)
          .describe("取得件数（デフォルト: 50）"),
      }),
    },
    async ({ prefecture, municipality, region, poet_name, limit }) => {
      const options: SearchOptions = { limit };

      if (prefecture) {
        options.prefecture = prefecture;
      }
      if (municipality) {
        options.municipality = municipality;
      }
      if (region) {
        options.region = region;
      }
      if (poet_name) {
        options.poet_name_contains = poet_name;
      }

      const monuments = await fetchMonuments(options);
      const geojson = convertToGeoJSON(monuments);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(geojson, null, 2),
          },
        ],
      };
    },
  );
}
