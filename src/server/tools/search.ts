import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchMonuments, fetchPoems } from "../../api.js";
import { fetchMonumentById } from "../../api.js";
import type { Monument } from "../../types.js";

async function fetchMonumentsSafely(ids: number[]): Promise<Monument[]> {
  if (ids.length === 0) {
    return [];
  }

  const settled = await Promise.allSettled(
    ids.map((id) => fetchMonumentById(id)),
  );
  const successful: Monument[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      successful.push(result.value);
    }
  }

  return successful;
}

function extractSearchTerms(raw: string): string[] {
  const normalized = raw.trim();
  const terms = new Set<string>();

  if (normalized.length > 1) {
    terms.add(normalized);
  }

  const punctuationSeparated = normalized
    .replace(/[、。,，．!?！？\n\r\t]+/gu, " ")
    .split(/\s+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && term.length <= 30);

  for (const term of punctuationSeparated) {
    terms.add(term);
  }

  const scriptMatches = normalized.match(
    /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|\p{Number}){2,}/gu,
  );
  if (scriptMatches) {
    for (const match of scriptMatches) {
      const trimmed = match.trim();
      if (trimmed.length >= 2) {
        terms.add(trimmed);
      }
    }
  }

  if (terms.size === 0 && normalized.length > 0) {
    terms.add(normalized);
  }

  return Array.from(terms).slice(0, 5);
}

function mergeMonuments(target: Map<number, Monument>, entries: Monument[]) {
  for (const monument of entries) {
    if (!target.has(monument.id)) {
      target.set(monument.id, monument);
    }
  }
}

async function fetchMonumentsFromPoems(
  terms: readonly string[],
  limit: number,
): Promise<Monument[]> {
  if (terms.length === 0) {
    return [];
  }

  const poemResults = await Promise.allSettled(
    terms.map((term) => fetchPoems({ text_contains: term, limit })),
  );

  const uniqueIds = new Set<number>();

  for (const result of poemResults) {
    if (result.status !== "fulfilled") {
      continue;
    }

    for (const poem of result.value ?? []) {
      const inscriptions = poem.inscriptions ?? [];
      for (const inscription of inscriptions) {
        if (typeof inscription?.monument_id === "number") {
          uniqueIds.add(inscription.monument_id);
          if (uniqueIds.size >= limit) {
            break;
          }
        }
      }

      if (uniqueIds.size >= limit) {
        break;
      }
    }

    if (uniqueIds.size >= limit) {
      break;
    }
  }

  if (uniqueIds.size === 0) {
    return [];
  }

  return fetchMonumentsSafely(Array.from(uniqueIds).slice(0, limit));
}

async function fetchMonumentsByInscriptionTerms(
  terms: readonly string[],
  limit: number,
): Promise<Monument[]> {
  if (terms.length === 0) {
    return [];
  }

  const searchResults = await Promise.allSettled(
    terms.map((term) => fetchMonuments({ inscription_contains: term, limit })),
  );

  const aggregated = new Map<number, Monument>();

  for (const result of searchResults) {
    if (result.status !== "fulfilled") {
      continue;
    }

    mergeMonuments(aggregated, result.value);

    if (aggregated.size >= limit) {
      break;
    }
  }

  return Array.from(aggregated.values()).slice(0, limit);
}

export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    "find_similar_monuments",
    {
      description: "類似の句碑を検索",
      inputSchema: z.object({
        searchText: z.string().describe("検索テキスト"),
        limit: z.number().optional().default(50).describe("取得件数"),
      }),
    },
    async ({ searchText, limit }) => {
      const max = limit ?? 50;
      const candidateTerms = extractSearchTerms(searchText).slice(0, 5);
      const aggregatedMonuments = new Map<number, Monument>();

      const monumentsFromPoems = await fetchMonumentsFromPoems(
        candidateTerms,
        max,
      );
      mergeMonuments(aggregatedMonuments, monumentsFromPoems);

      if (aggregatedMonuments.size < max) {
        const inscriptionMatches = await fetchMonumentsByInscriptionTerms(
          candidateTerms,
          max,
        );
        mergeMonuments(aggregatedMonuments, inscriptionMatches);
      }

      if (aggregatedMonuments.size === 0) {
        try {
          const fallbackMonuments = await fetchMonuments({ limit: max });
          mergeMonuments(aggregatedMonuments, fallbackMonuments);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text",
                text: `句碑データの取得に失敗しました: ${message}`,
              },
            ],
            isError: true,
          };
        }
      }

      const monuments = Array.from(aggregatedMonuments.values()).slice(0, max);

      if (monuments.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "該当する句碑が見つかりませんでした。別のキーワードや俳人名でお試しください。",
            },
          ],
          isError: true,
        };
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
