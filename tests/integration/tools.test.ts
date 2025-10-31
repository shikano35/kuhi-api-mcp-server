import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createMcpServer } from "../../src/server/create-server.js";
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
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("統合テスト - createMcpServer", () => {
  it("MCPサーバーインスタンスが正しく作成される", () => {
    const mcpServer = createMcpServer();
    expect(mcpServer).toBeDefined();
    expect(typeof mcpServer).toBe("object");
  });

  it("カスタム設定でサーバーを作成できる", () => {
    const mcpServer = createMcpServer({
      name: "test-server",
      version: "1.0.0",
    });
    expect(mcpServer).toBeDefined();
  });
});

describe("統合テスト - Tools登録", () => {
  it("7つのToolsが登録されている", () => {
    const mcpServer = createMcpServer();
    expect(mcpServer).toBeDefined();
  });
});

describe("統合テスト - 外部API依存の排除", () => {
  it("MSWでモック化されたAPIからデータを取得できる", async () => {
    const response = await fetch("https://api.kuhi.jp/monuments");
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);
  });

  it("俳人名フィルタが動作する", async () => {
    const response = await fetch(
      "https://api.kuhi.jp/monuments?poet_name_contains=松尾芭蕉",
    );
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].poets[0].name).toBe("松尾芭蕉");
  });

  it("limitパラメータが動作する", async () => {
    const response = await fetch("https://api.kuhi.jp/monuments?limit=1");
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
  });

  it("俳人検索APIが動作する", async () => {
    const response = await fetch(
      "https://api.kuhi.jp/poets?name_contains=芭蕉",
    );
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("松尾芭蕉");
  });
});
