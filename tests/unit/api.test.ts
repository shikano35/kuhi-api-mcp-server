import { describe, expect, it } from "vitest";
import { buildApiUrl } from "../../src/api.js";

describe("API Utils", () => {
  describe("buildApiUrl", () => {
    const BASE_URL = "https://api.kuhi.jp";

    it("基本的なエンドポイントURLを構築", () => {
      const url = buildApiUrl("/monuments");
      expect(url).toBe(`${BASE_URL}/monuments`);
    });

    it("IDを含むURLを構築", () => {
      const url = buildApiUrl("/monuments", 123);
      expect(url).toBe(`${BASE_URL}/monuments/123`);
    });

    it("クエリパラメータを含むURLを構築", () => {
      const url = buildApiUrl("/monuments", undefined, {
        limit: "10",
        offset: "0",
      });
      expect(url).toBe(`${BASE_URL}/monuments?limit=10&offset=0`);
    });

    it("IDとクエリパラメータの両方を含むURLを構築", () => {
      const url = buildApiUrl("/monuments", 123, {
        expand: "true",
      });
      expect(url).toBe(`${BASE_URL}/monuments/123?expand=true`);
    });

    it("空のクエリパラメータを無視", () => {
      const url = buildApiUrl("/monuments", undefined, {});
      expect(url).toBe(`${BASE_URL}/monuments`);
    });

    it("複数のクエリパラメータを正しくエンコード", () => {
      const url = buildApiUrl("/monuments", undefined, {
        poet_name: "松尾芭蕉",
        region: "東海",
        limit: "5",
      });
      expect(url).toContain("poet_name=%E6%9D%BE%E5%B0%BE%E8%8A%AD%E8%95%89");
      expect(url).toContain("region=%E6%9D%B1%E6%B5%B7");
      expect(url).toContain("limit=5");
    });

    it("空文字列のパラメータを含むURLを構築", () => {
      const url = buildApiUrl("/monuments", undefined, {
        q: "",
        limit: "10",
      });
      expect(url).not.toContain("q=");
      expect(url).toContain("limit=10");
    });
  });
});
