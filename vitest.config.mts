import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "out/**", "e2e/**"],
    env: {
      // 前端 Store 单测走本地 Mock 分支；服务端/服务层测试各自 mock API。
      NEXT_PUBLIC_USE_MOCK: "true",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "lib/money.ts",
        "lib/pricing.ts",
        "lib/domain/**/*.ts",
        "lib/stores/**/*.ts",
        "lib/services/**/*.ts",
        "lib/api/routes.ts",
        "server/app.ts",
        "server/domain.ts",
        "server/rate-limit.ts",
        "server/repositories/memory.ts",
        "server/security.ts",
      ],
      exclude: ["**/*.test.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
})
