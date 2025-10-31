import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  fetchMonumentById,
  fetchMonuments,
  fetchPoets,
} from "../../src/api.js";
import { mockMonuments, mockPoets } from "../fixtures/mock-data.js";

const server = setupServer(
  // GET /monuments
  http.get("https://api.kuhi.jp/monuments", ({ request }) => {
    const url = new URL(request.url);
    const poetName = url.searchParams.get("poet_name_contains");
    const limit = url.searchParams.get("limit");

    let monuments = mockMonuments;

    if (poetName) {
      monuments = monuments.filter((m) =>
        m.poets?.some((p) => p.name.includes(poetName)),
      );
    }

    if (limit) {
      monuments = monuments.slice(0, Number.parseInt(limit, 10));
    }

    return HttpResponse.json(monuments);
  }),

  // GET /poets
  http.get("https://api.kuhi.jp/poets", ({ request }) => {
    const url = new URL(request.url);
    const nameContains = url.searchParams.get("name_contains");

    let poets = mockPoets;

    if (nameContains) {
      poets = poets.filter((p) => p.name.includes(nameContains));
    }

    return HttpResponse.json(poets);
  }),

  // GET /monuments/:id
  http.get("https://api.kuhi.jp/monuments/:id", ({ params }) => {
    const { id } = params;
    const monument = mockMonuments.find((m) => m.id === Number(id));

    if (!monument) {
      return HttpResponse.json({ error: "Not Found" }, { status: 404 });
    }

    return HttpResponse.json(monument);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("統合テスト - fetchMonuments", () => {
  it("俳人名で句碑を検索できる", async () => {
    const result = await fetchMonuments({
      poet_name_contains: "松尾芭蕉",
      limit: 10,
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].poets?.[0].name).toBe("松尾芭蕉");
  });

  it("limitパラメータが適用される", async () => {
    const result = await fetchMonuments({ limit: 1 });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
  });

  it("空の検索結果を処理できる", async () => {
    const result = await fetchMonuments({
      poet_name_contains: "存在しない俳人",
      limit: 10,
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});

describe("統合テスト - fetchPoets", () => {
  it("俳人一覧を取得できる", async () => {
    const result = await fetchPoets({ limit: 10 });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("name");
  });

  it("名前で俳人を検索できる", async () => {
    const result = await fetchPoets({ name_contains: "芭蕉" });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("松尾芭蕉");
  });
});

describe("統合テスト - fetchMonumentById", () => {
  it("IDで句碑を取得できる", async () => {
    const result = await fetchMonumentById(1);

    expect(result).toBeDefined();
    expect(result.id).toBe(1);
    expect(result.canonical_name).toBeDefined();
  });

  it("存在しないIDの場合はエラーを返す", async () => {
    await expect(fetchMonumentById(9999)).rejects.toThrow();
  });
});

describe("統合テスト - エラーハンドリング", () => {
  it("APIエラー時に適切なエラーメッセージを返す", async () => {
    server.use(
      http.get("https://api.kuhi.jp/monuments", () => {
        return HttpResponse.json(
          { error: "Internal Server Error" },
          { status: 500 },
        );
      }),
    );

    await expect(fetchMonuments({ limit: 10 })).rejects.toThrow();
  });

  it("ネットワークエラー時にリトライ機構が動作する", async () => {
    let attemptCount = 0;

    server.use(
      http.get("https://api.kuhi.jp/monuments", () => {
        attemptCount++;

        if (attemptCount < 3) {
          return HttpResponse.error();
        }

        return HttpResponse.json(mockMonuments);
      }),
    );

    const result = await fetchMonuments({ limit: 10 });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(attemptCount).toBe(3);
  });
});
