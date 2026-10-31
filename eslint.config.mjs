import { FlatCompat } from "@eslint/eslintrc"
import path from "node:path"
import { fileURLToPath } from "node:url"

const baseDirectory = path.dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory })

const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // 存量代码先以警告收敛，新增代码不得新增告警。
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "react/no-unescaped-entities": "warn",
    },
  },
]

export default config

