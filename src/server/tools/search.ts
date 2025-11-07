import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchMonuments, fetchPoems } from "../../api.js";
import { fetchMonumentById } from "../../api.js";
import type { Monument, SearchOptions } from "../../types.js";

export function registerSearchTools(server: McpServer): void {
  server.tool(
    "find_similar_monuments",
    "類似の句碑を検索",
    {
      searchText: z.string().describe("検索テキスト"),
      limit: z.number().optional().default(50).describe("取得件数"),
    },
    async ({ searchText, limit }) => {
      const max = limit ?? 50;

      const poems = await fetchPoems({ text_contains: searchText, limit: max });

      const monumentIdSet = new Set<number>();
      for (const poem of poems) {
        const inscriptions = poem.inscriptions ?? [];
        for (const ins of inscriptions) {
          if (typeof ins.monument_id === "number") {
            monumentIdSet.add(ins.monument_id);
          }
        }
      }

      let monuments: Monument[] = [];
      if (monumentIdSet.size > 0) {
        const ids = Array.from(monumentIdSet).slice(0, max);
        const fetched = await Promise.all(
          ids.map((id) => fetchMonumentById(id)),
        );
        monuments = fetched;
      } else {
        const searchOptions: SearchOptions = {
          inscription_contains: searchText,
          limit: max,
        };
        monuments = await fetchMonuments(searchOptions);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(monuments, null, 2),
          },
        ],
      };
    },
  );
}
