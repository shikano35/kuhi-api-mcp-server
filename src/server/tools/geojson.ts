import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  Monument,
} from "../../types.js";
import { fetchMonuments } from "../../api.js";

function safeArrayAccess<T>(
  array: readonly T[] | undefined,
  index: number,
): T | undefined {
  return array && array.length > index ? array[index] : undefined;
}

export function convertToGeoJSON(monuments: Monument[]): GeoJSONFeatureCollection {
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
  server.tool(
    "get_haiku_monuments_geojson",
    "句碑データベースに登録されている句碑の情報をGeoJSON形式で表示（最大20件）",
    {},
    async () => {
      // Cloudflareエラーを避けるため、小さな制限で取得
      const monuments = await fetchMonuments({ limit: 20, offset: 0 });
      const geojson = convertToGeoJSON(monuments);
      return { content: [{ type: "text", text: JSON.stringify(geojson) }] };
    },
  );
}
