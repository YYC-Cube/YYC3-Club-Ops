# YYC³ Club Ops - 文档中心

> 域名：[club.yyc3.top](https://club.yyc3.top) | 仓库：[YYC3-Club-Ops](https://github.com/YYC-Cube/YYC3-Club-Ops)
>
> 文档原则：**实现态与计划态分离、每条结论有证据、变更同步契约。**

## 一、开发者文档

| 文档 | 说明 |
|---|---|
| [快速开始](./QUICK_START.md) | 环境、安装、Mock/真实 API、演示账号 |
| [开发指南](./DEVELOPMENT_GUIDE.md) | 编码规范、认证/CSRF 约定、测试与文档要求 |
| [系统架构](./ARCHITECTURE.md) | 路由、状态、API、安全链路 |
| [API 参考](./API_REFERENCE.md) | 客户端方法、端点、CSRF、错误码 |
| [数据库设计](./DATABASE_DESIGN.md) | 表结构、RLS、会话、限流、迁移规则 |
| [部署指南](./DEPLOYMENT_GUIDE.md) | CI/CD、Pages、生产上线清单 |
| [FAQ](./FAQ.md) | 环境、构建、CSRF、限流、会话 |
| [品牌徽章规范](./BRAND_BADGES.md) | 徽章矩阵、配色、顶图、维护 |
| [可视化交互体系](./VISUALIZATION_INTERACTION.md) | 设计令牌、状态、动效、无障碍 |
| [GitHub 元数据](./GITHUB_METADATA.md) | 描述、Topics、关键词、Issue 标签 |

## 二、阶段与安全报告

| 文档 | 说明 |
|---|---|
| [00 项目现状审核报告](./YYC3-Club-Ops-TraeCode-20261031/00-项目现状审核报告.md) | 基线、问题清单、评分 |
| [01 任务规划与节点目标](./YYC3-Club-Ops-TraeCode-20261031/01-任务规划与节点目标.md) | Phase 1~4 与验收 |
| [02 执行日志与进度跟踪](./YYC3-Club-Ops-TraeCode-20261031/02-执行日志与进度跟踪.md) | 命令、副作用、阻塞 |
| [03 总结文档与状态同步](./YYC3-Club-Ops-TraeCode-20261031/03-总结文档与状态同步.md) | 会话交接与统计 |
| [04 测试验证方案与执行结果](./YYC3-Club-Ops-TraeCode-20261031/04-测试验证方案与执行结果.md) | 用例、门禁、数据库/认证验证 |
| [05 协作对接指引](./YYC3-Club-Ops-TraeCode-20261031/05-协作对接指引.md) | RACI、同步机制、上报路径 |
| [06 多店 SaaS 架构决策](./YYC3-Club-Ops-TraeCode-20261031/06-架构决策-多店SaaS.md) | ADR-001 |
| [07 Phase 2 门店上下文与契约](./YYC3-Club-Ops-TraeCode-20261031/07-Phase2-门店上下文与契约占位层.md) | Session/门店/OpenAPI |
| [08 真实会话与房间 API](./YYC3-Club-Ops-TraeCode-20261031/08-真实会话与房间API.md) | Hono API、房间闭环、计费 |
| [09 艺人管理域对接评估](./YYC3-Club-Ops-TraeCode-20261031/09-艺人管理域对接评估.md) | 28 模块与分期 |
| [10 PostgreSQL 适用性分析](./YYC3-Club-Ops-TraeCode-20261031/10-PostgreSQL适用性分析.md) | 拓扑、RLS、迁移 |
| [11 认证 RLS 与登录限流](./YYC3-Club-Ops-TraeCode-20261031/11-认证RLS与登录限流.md) | 认证安全落地 |
| [12 CSRF 与会话刷新](./YYC3-Club-Ops-TraeCode-20261031/12-CSRF与会话刷新.md) | 同步令牌、滑动续期、绝对上限 |
| [13 审计与强制下线](./YYC3-Club-Ops-TraeCode-20261031/13-审计与强制下线.md) | 认证审计、强制下线、权限边界 |
| [14 POS 点单与结账闭环](./YYC3-Club-Ops-TraeCode-20261031/14-POS点单与结账闭环.md) | 价目表、购物车、退单、支付方式、小票 |
| [15 三项目关系与命名混淆分析](./YYC3-Club-Ops-TraeCode-20261031/15-三项目关系与命名混淆分析.md) | 产品族血缘、重叠矩阵、命名/端口/域名治理 |
| [16 B 端经营管理运维 App 合并设计](./YYC3-Club-Ops-TraeCode-20261031/16-B端经营管理运维App-合并设计可行性分析.md) | 双端 IA、房态/POS 面板复用、CMS 数据后台、MVP 路线 |
| [17 参考项目冻结说明](./YYC3-Club-Ops-TraeCode-20261031/17-参考项目冻结说明-Futuristic-Dashboard.md) | Futuristic-Dashboard 转只读参考、冻结动作与例外流程 |

## 三、跨系统协同规范（Club-Ops ↔ CMS）

| 文档 | 说明 |
|---|---|
| [协同规范总索引](./YYC3-Club-Ops_CMS协同规范/README.md) | 边界、铁律、现状差距、文档地图 |
| [01 协同定义总规范](./YYC3-Club-Ops_CMS协同规范/01-协同定义总规范.md) | 系统边界、数据归属矩阵、ID/金额/时间、API/安全/治理 |
| [02 数据同步契约（双向）](./YYC3-Club-Ops_CMS协同规范/02-主数据同步契约-CMS到App.md) | 中央配置 CMS→App、门店运营数据 App→CMS、纠正命令、版本/冲突 |
| [03 交易回传契约](./YYC3-Club-Ops_CMS协同规范/03-交易回传契约-App到CMS.md) | Outbox、事件目录、传输/重试/幂等/顺序、CMS 入库 |
| [04 数据字典与字段映射](./YYC3-Club-Ops_CMS协同规范/04-数据字典与字段映射.md) | 租户/门店/员工/商品/房型/会员/艺人/订单字段级映射 |
| [05 对账异常与联调验收](./YYC3-Club-Ops_CMS协同规范/05-对账异常与联调验收.md) | T+1 对账、差异处置、联调用例、上线清单 |
| [06 变更管理与版本记录](./YYC3-Club-Ops_CMS协同规范/06-变更管理与版本记录.md) | 版本体系、变更类型、灰度/回滚、弃用 |
| [07 CMS 实施排期与就绪门禁](./YYC3-Club-Ops_CMS协同规范/07-CMS实施排期与就绪门禁.md) | 中央配置、运营投影、纠正命令、事件日志、对账的 10 周排期 |
| [08 PC 功能基线与同步映射](./YYC3-Club-Ops_CMS协同规范/08-PC功能基线与同步映射.md) | 官方桌面版手册 7 大模块/42+ 子模块 → 数据域/owner/事件/命令（08A，已评审：映射方向正确） |
| [09 评审记录-PC 模块命令映射](./YYC3-Club-Ops_CMS协同规范/09-评审记录-PC模块命令映射.md) | CMS 侧评审 08 全文归档：映射方向正确、6 项 P0、W2 建表批次、报表 MVP |

## 四、团队规范

| 文档 | 说明 |
|---|---|
| [团队通用开发文档](./YYC3-团队通用-标规文档/YYC3-团队通用-开发文档.md) | AI 协同开发流程 |
| [团队开发标准](./YYC3-团队通用-标规文档/YYC3-团队规范-开发标准.md) | 工程与质量规范 |
| [文档闭环规范](./YYC3-团队通用-标规文档/YYC3-团队规范-文档闭环.md) | 文档生产与归档 |
| [五维驱动](./YYC3-团队通用-标规文档/YYC3-团队核心-五维驱动.md) | 五高五标五化 |
| [架构可视化设计](./YYC3-团队通用-标规文档/YYC3-架构体系-可视化设计.md) | Mermaid 架构表达 |
| [多端适配规范](./YYC3-团队通用-标规文档/YYC3-多端适配-规范文档.md) | 响应式与多端 |

## 五、社区与政策

- [贡献指南](../CONTRIBUTING.md)
- [行为准则](../CODE_OF_CONDUCT.md)
- [安全政策](../SECURITY.md)
- [MIT 许可证](../LICENSE)

---

> ***YanYuCloudCube*** · *言启象限 | 语枢未来*
