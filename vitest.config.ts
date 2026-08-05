import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "dist/**", "haiku_monument_api/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "haiku_monument_api/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "vitest.config.ts",
      ],
    },
  },
});
