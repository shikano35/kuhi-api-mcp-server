import { describe, expect, it } from "vitest";
import {
  formatDistance,
  parseSeasonQuery,
  validateCoordinates,
} from "../../src/utils.js";

describe("Utils", () => {
  describe("validateCoordinates", () => {
    it("有効な座標を受け入れる", () => {
      expect(validateCoordinates(35.0, 136.0)).toBe(true);
      expect(validateCoordinates(0, 0)).toBe(true);
      expect(validateCoordinates(-90, -180)).toBe(true);
      expect(validateCoordinates(90, 180)).toBe(true);
    });

    it("無効な緯度を拒否する", () => {
      expect(validateCoordinates(91.0, 136.0)).toBe(false);
      expect(validateCoordinates(-91.0, 136.0)).toBe(false);
      expect(validateCoordinates(100, 0)).toBe(false);
    });

    it("無効な経度を拒否する", () => {
      expect(validateCoordinates(35.0, 181.0)).toBe(false);
      expect(validateCoordinates(35.0, -181.0)).toBe(false);
      expect(validateCoordinates(0, 200)).toBe(false);
    });

    it("境界値を正しく処理する", () => {
      expect(validateCoordinates(90, 180)).toBe(true);
      expect(validateCoordinates(-90, -180)).toBe(true);
      expect(validateCoordinates(90.0001, 180)).toBe(false);
      expect(validateCoordinates(90, 180.0001)).toBe(false);
    });
  });

  describe("formatDistance", () => {
    it("1km未満はメートル表示", () => {
      expect(formatDistance(500)).toBe("500m");
      expect(formatDistance(999)).toBe("999m");
      expect(formatDistance(50)).toBe("50m");
    });

    it("1km以上はキロメートル表示", () => {
      expect(formatDistance(1000)).toBe("1.0km");
      expect(formatDistance(1500)).toBe("1.5km");
      expect(formatDistance(2345)).toBe("2.3km");
    });

    it("小数点第1位まで表示", () => {
      expect(formatDistance(1234)).toBe("1.2km");
      expect(formatDistance(9876)).toBe("9.9km");
    });

    it("0メートルを正しく処理", () => {
      expect(formatDistance(0)).toBe("0m");
    });
  });

  describe("parseSeasonQuery", () => {
    it("日本語の季節名を正規化", () => {
      expect(parseSeasonQuery("春")).toBe("春");
      expect(parseSeasonQuery("夏")).toBe("夏");
      expect(parseSeasonQuery("秋")).toBe("秋");
      expect(parseSeasonQuery("冬")).toBe("冬");
    });

    it("英語の季節名を日本語に変換", () => {
      expect(parseSeasonQuery("spring")).toBe("春");
      expect(parseSeasonQuery("summer")).toBe("夏");
      expect(parseSeasonQuery("autumn")).toBe("秋");
      expect(parseSeasonQuery("fall")).toBe("秋");
      expect(parseSeasonQuery("winter")).toBe("冬");
    });

    it("ひらがなの季節名を変換", () => {
      expect(parseSeasonQuery("はる")).toBe("春");
      expect(parseSeasonQuery("なつ")).toBe("夏");
      expect(parseSeasonQuery("あき")).toBe("秋");
      expect(parseSeasonQuery("ふゆ")).toBe("冬");
    });

    it("大文字小文字を区別しない", () => {
      expect(parseSeasonQuery("SPRING")).toBe("春");
      expect(parseSeasonQuery("Summer")).toBe("夏");
      expect(parseSeasonQuery("AUTUMN")).toBe("秋");
    });

    it("無効な入力にnullを返す", () => {
      expect(parseSeasonQuery("invalid")).toBe(null);
      expect(parseSeasonQuery("")).toBe(null);
      expect(parseSeasonQuery("123")).toBe(null);
    });
  });
});
