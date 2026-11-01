// ESLint flat config（Next 16 起 eslint-config-next 仅提供 flat 导出，不再经 FlatCompat 转换）。
import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

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
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // 存量代码先以警告收敛，新增代码不得新增告警。
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "react/no-unescaped-entities": "warn",
      // Next 16 / React Compiler 新规则：purity 16 处已修复（mock 时间戳模块级、
      // 确定性 mock 值、挂载期快照）；set-state 7 处合法模式改行级豁免后，两条规则
      // 已恢复 error 严格态（2026-11-01）。
    },
  },
]

export default config
