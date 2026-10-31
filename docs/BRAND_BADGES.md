# 品牌徽章设计规范 · Brand & Badges

> YYC³ Club Ops · `club.yyc3.top`
>
> 原则：**一屏可读、语义稳定、颜色克制、可自动维护**。

---

## 一、设计目标

徽章不是装饰，而是**仓库的第一层状态契约**。本规范确保：

1. 任何人 3 秒内判断项目成熟度、技术栈、门禁与许可；
2. 徽章颜色与含义一一对应，不因迭代漂移；
3. 静态徽章与动态徽章职责分离，避免“过期数字”误导；
4. 与 YYC³「五高」一致：高可用（CI）、高性能（构建）、高安全（安全政策）、高扩展（技术栈）、高智能（文档）。

## 二、颜色令牌

| 语义 | 色值 | 用途 | 示例 |
|---|---|---|---|
| 品牌主色 | `#06B6D4`（Cyan 500） | 品牌/文档 | `docs-YYC³` |
| 运行中 | `#3FB950`（Green） | 测试通过、安全 | `tests`、`security` |
| 预览/非生产 | `#F97316`（Orange） | 状态提示 | `status-preview` |
| 警告 | `#EAB308`（Yellow） | 许可、待办 | `license-MIT` |
| 失败/危险 | `#EF4444`（Red） | 漏洞、故障 | 仅用于真实失败 |
| 技术黑 | `#0F172A`（Slate 900） | 框架类 | `Next.js` |
| 信息蓝 | `#2563EB`（Blue 600） | 贡献/协作 | `contributing` |
| 紫 | `#8B5CF6`（Violet 500） | 文档/智能 | `docs` |

> 颜色仅表达语义，不表达优先级；同一含义在 README、文档、Issue 标签中保持一致。

## 三、徽章矩阵

### 3.1 静态徽章（README 顶部）

| 徽章 | 文案 | 颜色 | 维护方式 |
|---|---|---|---|
| 状态 | `status-preview` | orange | 随阶段手动更新（Phase 2 → 3 → 4） |
| 框架 | `Next.js-15.5.28` | black | 升级依赖时同步 |
| 框架 | `React-19` | `#61DAFB` | 升级依赖时同步 |
| 语言 | `TypeScript-5` | `#3178C6` | 升级依赖时同步 |
| 数据库 | `PostgreSQL-15` | `#4169E1` | 迁移大版本时同步 |
| 测试 | `tests-124 passed` | green | **仅发布/合并前更新**，日常以 CI 徽章为准 |
| 许可 | `license-MIT` | yellow | 许可变更时同步 |
| 文档 | `docs-YYC³ 标准` | violet | 文档体系变更时同步 |

### 3.2 动态徽章

| 徽章 | 来源 | 说明 |
|---|---|---|
| CI | GitHub Actions `deploy.yml` | 唯一“实时真实性”来源 |
| 安全 | 静态链接到 `SECURITY.md` | 不展示未经核实的分级 |
| 贡献 | 静态链接到 `CONTRIBUTING.md` | 降低首次贡献门槛 |

```md
[![CI](https://github.com/YYC-Cube/YYC3-Club-Ops/actions/workflows/deploy.yml/badge.svg)](https://github.com/YYC-Cube/YYC3-Club-Ops/actions/workflows/deploy.yml)
```

## 四、README 顶图

```md
<div align="center">
  <img src="./public/yyc3-family.png" alt="YYC³ Club Ops — 多店 KTV 运营 SaaS" width="100%" />
</div>
```

| 项 | 规格 |
|---|---|
| 文件 | `public/yyc3-family.png` |
| 尺寸 | 1800 × 450（4:1 横幅） |
| 安全边距 | 左右 ≥ 5%，底部 ≥ 8%（适配移动端裁切） |
| 替代文本 | 必填，包含项目名与定位 |
| 背景 | 深色底，避免与浅色 README 主题冲突 |

## 五、徽章使用规则

1. **数量上限**：README 顶部 ≤ 12 枚；按「状态 → 技术栈 → 门禁 → 社区」排序。
2. **不重复**：同一信息不同时用静态与动态徽章表达。
3. **不夸大**：禁止使用 `production-ready`、`enterprise` 等未验收表述。
4. **可点击**：所有徽章必须链接到可验证位置（CI、LICENSE、SECURITY）。
5. **无障碍**：保留 `alt`，不以颜色作为唯一信息载体。
6. **数字时效**：测试数仅在发布说明中更新；日常以 CI 为准。

## 六、维护检查清单

- [ ] 徽章链接可访问（CI、LICENSE、SECURITY）
- [ ] 版本号与 `package.json` 一致
- [ ] 测试数量与最近一次 `pnpm test` 一致
- [ ] 状态徽章与当前阶段一致（预览 ≠ 生产）
- [ ] 顶图替代文本存在
- [ ] 深色/浅色主题下均可辨识

## 七、扩展位

未来可增加（Phase 3/4）：

| 徽章 | 触发条件 |
|---|---|
| `coverage-93%` | 覆盖率门禁稳定后 |
| `e2e-14 passed` | E2E 成为核心门禁后 |
| `p95-<200ms` | 性能基线建立后 |
| `release-v1.0.0` | 首次生产发布 |

---

> ***YanYuCloudCube*** · *言启象限 | 语枢未来*
