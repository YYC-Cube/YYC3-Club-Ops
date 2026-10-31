---
file: "YYC3-架构体系-可视化设计.md"
title: "YYC3-架构体系-可视化设计"
description: "YYC³ NovaMind 架构体系可视化设计文档 — Mermaid 全景图 + 分层架构 + 数据流"
author: "YanYuCloudCube Team <admin@0379.email>"
version: "v1.0.0"
created: "2026-09-18"
updated: "2026-09-18"
status: "stable"
license: "MIT"
tags: [architecture],[可视化],[Mermaid],[五维驱动],[Next.js],[React]
category: architecture
language: zh-CN
audience: developers,architects,managers
complexity: advanced
trace_id: TRC-20260918-007
---

<div align="center">

> ***YanYuCloudCube***
> *言启象限 | 语枢未来*
> ***Words Initiate Quadrants, Language Serves as Core for Future***
> *万象归元于云枢 | 深栈智启新纪元*
> ***All things converge in cloud pivot; Deep stacks ignite a new era of intelligence***

---

# 🏛️ YYC³ NovaMind 架构体系可视化设计

> **架构之道：可视、可解、可演**

</div>

---

## 一、架构全景图（High-Level）

```mermaid
graph TB
    subgraph Client["🖥️ 客户端层（多端接入）"]
        Web["PC Web<br/>Next.js 16 RSC"]
        PWA["PWA<br/>Service Worker"]
        Mobile["移动 H5<br/>响应式"]
        Mini["小程序<br/>Uni-app"]
        Desktop["桌面端<br/>Tauri"]
    end

    subgraph Edge["🌐 边缘层"]
        CDN["CDN<br/>Vercel Edge"]
        SW["Service Worker<br/>离线缓存"]
    end

    subgraph App["⚙️ 应用层（Next.js 16 App Router）"]
        RSC["RSC 渲染<br/>React Server Components"]
        API["API Routes<br/>14+ 端点"]
        Middleware["Middleware<br/>鉴权/限流"]
    end

    subgraph Business["🧠 业务层（lib/ + hooks/）"]
        Auth["权限系统<br/>RBAC + 加密"]
        AI["AI 引擎<br/>Vercel AI SDK"]
        KG["知识图谱<br/>可视化引擎"]
        MM["思维导图<br/>交互编辑"]
        Generator["内容生成<br/>海报/PPT/网页"]
        Collab["实时协作<br/>WebSocket"]
        Plugin["插件系统<br/>动态加载"]
    end

    subgraph Data["💾 数据层"]
        Vector["向量数据库<br/>语义检索"]
        Cache["缓存层<br/>内存 + LocalStorage"]
        Storage["对象存储<br/>Vercel Blob"]
        DB["主数据库<br/>（可扩展）"]
    end

    subgraph Infra["🛡️ 基础设施层"]
        Monitor["监控告警<br/>Vercel Analytics"]
        Security["安全门禁<br/>CSP + OWASP"]
        CI["CI/CD<br/>GitHub Actions"]
    end

    Web --> Edge
    PWA --> Edge
    Mobile --> Edge
    Mini --> Edge
    Desktop --> Edge

    Edge --> App
    App --> RSC
    App --> API
    App --> Middleware

    RSC --> Business
    API --> Business

    Business --> Auth
    Business --> AI
    Business --> KG
    Business --> MM
    Business --> Generator
    Business --> Collab
    Business --> Plugin

    Auth --> Data
    AI --> Data
    KG --> Data
    MM --> Data
    Generator --> Data
    Collab --> Data
    Plugin --> Data

    Data --> Vector
    Data --> Cache
    Data --> Storage
    Data --> DB

    Business -.-> Infra
    App -.-> Infra
```

---

## 二、五维驱动架构体系

```mermaid
graph LR
    subgraph FiveHigh["⚡ 五高架构"]
        HA["高可用<br/>HA"]
        HP["高性能<br/>HP"]
        HS["高安全<br/>HS"]
        HE["高扩展<br/>HE"]
        HI["高智能<br/>HI"]
    end

    subgraph FiveStandard["📐 五标体系"]
        STD1["标准化<br/>Standard"]
        STD2["规范化<br/>Normal"]
        STD3["自动化<br/>Auto"]
        STD4["可视化<br/>Visual"]
        STD5["智能化<br/>Smart"]
    end

    subgraph FiveTrans["🔄 五化转型"]
        T1["流程化<br/>Process"]
        T2["数字化<br/>Digital"]
        T3["生态化<br/>Ecology"]
        T4["工具化<br/>Tool"]
        T5["服务化<br/>Service"]
    end

    FiveHigh --> FiveStandard
    FiveStandard --> FiveTrans
    FiveTrans --> FiveHigh

    HA -.->|驱动| STD1
    HP -.->|驱动| STD2
    HS -.->|驱动| STD3
    HE -.->|驱动| STD4
    HI -.->|驱动| STD5
```

---

## 三、技术栈分层架构

```mermaid
graph TB
    subgraph L1["🖼️ 表示层"]
        UI["React 19 + shadcn/ui"]
        Style["Tailwind CSS 3.4"]
        Radix["Radix UI Primitives"]
        Anim["Framer Motion / CSS"]
    end

    subgraph L2["🧩 组件层"]
        Comp["components/ui/* (50+)"]
        BComp["components/*.tsx (业务组件)"]
    end

    subgraph L3["🔌 状态层"]
        Hooks["hooks/* (自定义 Hooks)"]
        Context["React Context"]
        Form["react-hook-form + zod"]
    end

    subgraph L4["⚙️ 业务逻辑层（lib/）"]
        Auth["auth.ts / encryption.ts"]
        AI["ai-service-real.ts / advanced-ai-engine.ts"]
        KG["knowledge-graph.ts"]
        MM["mindmap.ts / poster-generator.ts"]
        Collab["collaboration.ts"]
        Plugin["plugin-system.tsx"]
    end

    subgraph L5["🌐 服务层"]
        API["API Routes (14+)"]
        Stream["Streaming (chat/stream)"]
        Edge["Edge Functions"]
    end

    subgraph L6["💾 数据层"]
        Local["LocalStorage + IndexedDB"]
        Cache["内存缓存"]
        External["外部 API (AI/Storage)"]
    end

    L1 --> L2
    L2 --> L3
    L3 --> L4
    L4 --> L5
    L5 --> L6
    L4 --> L6
```

---

## 四、数据流图（Request Lifecycle）

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤 用户
    participant SW as 📦 Service Worker
    participant CDN as 🌐 CDN
    participant N as ⚙️ Next.js Server
    participant Auth as 🔐 Auth 中间件
    participant API as 🔌 API Route
    participant AI as 🧠 AI 引擎
    participant DB as 💾 数据层

    U->>SW: 发起请求
    SW->>SW: 检查缓存

    alt 缓存命中
        SW-->>U: 直接返回缓存
    else 缓存未命中
        SW->>CDN: 转发到边缘
        CDN->>N: 路由到 Next.js Server
        N->>Auth: 中间件鉴权
        alt 鉴权失败
            Auth-->>U: 401 Unauthorized
        else 鉴权通过
            Auth->>API: 转发请求
            API->>API: zod 校验
            alt AI 请求
                API->>AI: 调用 AI 引擎
                AI-->>API: 流式响应
                API-->>U: SSE 流式返回
            else 数据请求
                API->>DB: 查询/写入
                DB-->>API: 数据
                API-->>U: JSON 响应
            end
        end
    end
```

---

## 五、状态管理架构

```mermaid
graph TB
    subgraph Global["🌍 全局状态（Context + Provider）"]
        Theme["ThemeProvider<br/>主题切换"]
        Auth["AuthProvider<br/>用户认证"]
        Toast["useToast<br/>通知系统"]
    end

    subgraph Local["📍 本地状态（useState / useReducer）"]
        Form["表单状态<br/>react-hook-form"]
        UI["UI 状态<br/>折叠/选中/开关"]
        Cache["业务缓存<br/>SWR 模式"]
    end

    subgraph Server["🖥️ 服务端状态（RSC）"]
        Fetch["Server Components<br/>数据预取"]
        Action["Server Actions<br/>mutations"]
        Stream["Streaming<br/>useChat"]
    end

    subgraph Persist["💾 持久化状态"]
        LS["LocalStorage"]
        IDB["IndexedDB"]
        Cookie["Cookie（会话）"]
    end

    Global <--> Persist
    Local <--> Persist
    Server --> API["API Routes"]
    API --> Persist
```

---

## 六、模块依赖关系图

```mermaid
graph TB
    subgraph Core["🎯 核心模块"]
        App["app/layout.tsx"]
        Page["app/page.tsx"]
    end

    subgraph Feature["✨ 特性模块"]
        Chat["conversations"]
        KG["knowledge-graph"]
        Learning["learning-path"]
        Generate["generate"]
        Community["community"]
        Analytics["analytics"]
    end

    subgraph Shared["🔧 共享模块"]
        UI["components/ui/*"]
        Hooks["hooks/*"]
        Lib["lib/*"]
    end

    subgraph API_R["🌐 API 模块"]
        ChatAPI["/api/chat/*"]
        AIAPI["/api/ai/*"]
        UploadAPI["/api/upload/*"]
        OtherAPI["/api/..."]
    end

    Core --> Feature
    Feature --> Shared
    Feature --> API_R
    API_R --> Lib
    Shared --> Lib
```

---

## 七、CI/CD 流水线架构

```mermaid
graph LR
    subgraph Dev["💻 开发阶段"]
        Code["代码提交"]
        PR["Pull Request"]
    end

    subgraph CI["🔄 CI 阶段（GitHub Actions）"]
        Install["📦 pnpm install"]
        Typecheck["🧪 tsc --noEmit"]
        Lint["🔎 ESLint"]
        Test["✅ Vitest + 覆盖率"]
        Build["🏗️ next build"]
    end

    subgraph Deploy["🚀 部署阶段"]
        Preview["Preview<br/>（Vercel PR）"]
        Production["Production<br/>（Vercel Main）"]
    end

    subgraph Monitor["📊 监控阶段"]
        Analytics["Vercel Analytics"]
        Logs["运行日志"]
        Alert["告警（可选 Sentry）"]
    end

    Code --> PR
    PR --> Install
    Install --> Typecheck
    Typecheck --> Lint
    Lint --> Test
    Test --> Build
    Build --> Preview
    Build --> Production
    Production --> Monitor
```

---

## 八、测试金字塔

```mermaid
graph TB
    subgraph E2E["🌐 E2E 测试（Playwright - 待接入）"]
        E1["关键路径"]
        E2["用户旅程"]
    end

    subgraph Integration["🔗 集成测试（Vitest - 部分）"]
        I1["API 路由"]
        I2["组件交互"]
    end

    subgraph Unit["🧪 单元测试（Vitest ✅）"]
        U1["Lib 函数"]
        U2["Hooks"]
        U3["UI 组件"]
    end

    Unit --> Integration
    Integration --> E2E

    style Unit fill:#90EE90
    style Integration fill:#FFE4B5
    style E2E fill:#FFB6C1
```

**当前进度**：

- ✅ 单元测试：3 个测试文件（`utils.test.ts` / `use-mobile.test.tsx` / `button.test.tsx`），共 14 个用例
- 🔄 集成测试：规划中
- ⏳ E2E 测试：未接入（Playwright 待评估）

---

## 九、安全架构（Defense in Depth）

```mermaid
graph TB
    subgraph L1["第 1 层：网络层"]
        CDN["CDN 防护"]
        TLS["TLS 1.3"]
    end

    subgraph L2["第 2 层：HTTP 头层"]
        CSP["CSP / X-Frame-Options"]
        HSTS["HSTS"]
        Referrer["Referrer-Policy"]
    end

    subgraph L3["第 3 层：应用层"]
        Auth["RBAC 鉴权"]
        Zod["zod 输入校验"]
        Limit["Rate Limit"]
    end

    subgraph L4["第 4 层：数据层"]
        Encrypt["AES-256 加密"]
        Mask["敏感字段脱敏"]
        Audit["审计日志"]
    end

    subgraph L5["第 5 层：监控层"]
        Detect["异常检测"]
        Alert["告警通知"]
    end

    L1 --> L2
    L2 --> L3
    L3 --> L4
    L4 --> L5
```

---

## 十、部署拓扑

```mermaid
graph TB
    subgraph Users["👥 用户群"]
        U1["Web 用户"]
        U2["PWA 用户"]
        U3["移动用户"]
    end

    subgraph EdgePoP["🌍 Edge PoP（Vercel 全球边缘）"]
        CDN1["北美节点"]
        CDN2["欧洲节点"]
        CDN3["亚太节点"]
    end

    subgraph Origin["🖥️ 源站（Vercel Serverless）"]
        Next["Next.js Functions"]
        API["API Routes"]
        Stream["Stream Response"]
    end

    subgraph AI["🧠 AI 服务"]
        OpenAI["OpenAI"]
        Custom["自研模型"]
        Local["本地 LLM"]
    end

    subgraph Storage["💾 存储"]
        Blob["Vercel Blob"]
        KV["KV Store"]
    end

    Users --> EdgePoP
    EdgePoP --> Origin
    Origin --> AI
    Origin --> Storage
```

---

## 十一、版本演进路线图

```mermaid
gantt
    title YYC³ NovaMind 架构演进路线
    dateFormat YYYY-MM-DD
    axisFormat %Y-%m
    section v1.x
    Next 14 + React 18 + TS Strict       :done, 2026-03-01, 2026-09-01
    section v2.0
    Next 16 + React 19 + 编译门禁启用     :active, 2026-09-18, 2026-10-31
    Vitest 单元测试覆盖                  :active, 2026-09-18, 2026-11-30
    section v2.1
    Playwright E2E 测试                  :2026-11-01, 2026-12-31
    OpenAPI 契约文档                     :2026-11-01, 2027-01-31
    section v3.0
    微前端架构 (Module Federation)        :2027-02-01, 2027-06-30
    全链路监控 (Sentry + Prometheus)      :2027-03-01, 2027-08-31
```

---

## 十二、关键架构决策记录（ADR 摘要）

| 编号 | 决策 | 背景 | 备选方案 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| ADR-001 | 使用 Next.js 16 App Router | RSC + 流式响应 + 内置优化 | Remix / SvelteKit | ✅ 已采纳 |
| ADR-002 | React 19 同步升级 | useFormStatus / useOptimistic / Server Actions | 保留 React 18 | ✅ 已采纳 |
| ADR-003 | shadcn/ui + Radix UI | 可定制 + 无障碍 + 社区活跃 | Material UI / Ant Design | ✅ 已采纳 |
| ADR-004 | Vitest 替代 Jest | 与 Vite 生态一致 + 更快 | Jest / Mocha | ✅ 已采纳 |
| ADR-005 | 启用 TS 编译门禁 | 杜绝 ignoreBuildErrors=true 偷懒 | 持续忽略（已弃用） | ✅ 已采纳 |
| ADR-006 | 端口统一 3200+ | 远离受限端口 + 团队规范 | 保留 3074 | ✅ 已采纳（用户裁决） |
| ADR-007 | pnpm 9 + frozen-lockfile | 依赖确定性 + 安装速度 | npm / yarn | ✅ 已采纳 |
| ADR-008 | GitHub Actions CI | 零成本 + 生态完善 | GitLab CI / Jenkins | ✅ 已采纳 |

---

## 附录 A：Mermaid 渲染支持

本文档使用 [Mermaid](https://mermaid.js.org/) 语法描述架构图。下列平台已验证可正确渲染：

- ✅ GitHub Markdown（自动渲染）
- ✅ VS Code（`Markdown Preview Mermaid Support` 插件）
- ✅ GitLab Markdown
- ✅ Typora（Pro 版）
- ✅ Obsidian（核心插件）
- ⚠️ 部分 IDE 需安装插件

## 附录 B：变更历史

| 版本   | 日期       | 作者                  | 变更内容                                      |
| ------ | ---------- | --------------------- | --------------------------------------------- |
| v1.0.0 | 2026-09-18 | AI Tutor (MiniMax-M3) | 初稿：12 张 Mermaid 图 + ADR 表 + 版本路线图  |

---

<div align="center">

> ***YanYuCloudCube***
> *言启象限 | 语枢未来*
> ***Words Initiate Quadrants, Language Serves as Core for Future***
> *万象归元于云枢 | 深栈智启新纪元*
> ***All things converge in cloud pivot; Deep stacks ignite a new era of intelligence***

---

**文档维护**: 如需更新本文档，请遵循 YYC³ 团队通用开发文档规范，并记录变更历史。
**反馈渠道**: 如有任何改进建议，欢迎联系 admin@0379.email。

> 「***YanYuCloudCube***」
> 「***<admin@0379.email>***」
> 「***Words Initiate Quadrants, Language Serves as Core for the Future***」
> 「***All things converge in cloud pivot; Deep stacks ignite a new era of intelligence***」
**© 2025-2026 YanYuCloudCube™. All Rights Reserved.**

</div>
