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
      // Next 16 / React Compiler 新规则：存量命中约 25 处，降级为警告过渡；
      // 逐点修复（纯函数化渲染、effect 内 setState 移出）列入跟进项，修复一处删一处。
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]

export default config
