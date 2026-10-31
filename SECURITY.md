# 安全政策 · Security Policy

> YYC³ Club Ops · 多店 KTV 运营 SaaS
>
> 我们重视数据隔离与资金安全。本政策说明**支持范围、报告方式、响应时限与安全基线**。

---

## 一、支持版本

| 版本 | 安全修复 |
|---|---|
| `main`（最新） | ✅ 接收 |
| 最近一个发布版本 | ✅ 接收 |
| 更早版本 | ❌ 建议升级 |

> 当前为**开发预览版**，尚未发布生产版本；生产使用前必须完成「上线前检查清单」。

## 二、报告漏洞

⚠️ **请勿通过公开 Issue、Discussion 或社交媒体披露漏洞细节。**

- 邮箱：**admin@0379.email**
- 主题：`[SECURITY] YYC3-Club-Ops`
- 建议使用 [GitHub Security Advisory](https://github.com/YYC-Cube/YYC3-Club-Ops/security/advisories) 私密报告（如可用）

请包含：

1. 受影响版本/提交；
2. 环境（Mock / 真实 API / 数据库）；
3. 复现步骤与最小 PoC；
4. 影响评估（越权、数据泄露、资金、可用性）；
5. 如可能，附修复建议。

## 三、响应承诺

| 阶段 | 时限 |
|---|---|
| 确认收到 | 48 小时内 |
| 初步分级（CVSS） | 7 天内 |
| 高危修复/缓解 | 30 天内 |
| 中低危修复 | 按排期，90 天内 |
| 协调披露 | 修复发布后 30 天或经双方同意 |

## 四、安全基线（当前实现）

| 领域 | 措施 |
|---|---|
| 密码 | `scrypt` + 随机盐 + `timingSafeEqual`；不存明文 |
| 会话 | HMAC-SHA256 签名 + 服务端会话表；登出即撤销；固定 TTL + 绝对上限 |
| Cookie | `HttpOnly`、`SameSite=Lax`、生产 `Secure`；不存 localStorage |
| CSRF | 会话绑定同步令牌；写操作校验 `X-CSRF-Token`；缺失/伪造 403 |
| 限流 | IP/账号双维度落库；429 + `Retry-After` |
| 多店隔离 | `tenant_id + store_id` RLS（业务表 FORCE）；认证表按租户/本人作用域 |
| 登录查询 | `SECURITY DEFINER` 函数精确匹配手机号；固定 `search_path` |
| 角色 | 应用使用 `yyc3_club_ops_app`（非 superuser / 非 bypassrls） |
| 输入 | JSON 体积/长度限制；参数化 SQL；错误不泄露堆栈 |
| 依赖 | `pnpm audit --prod --audit-level=high` 门禁 |
| CORS | 仅允许 `APP_ORIGIN` + credentials；`X-CSRF-Token` 白名单 |
| 代理 | `TRUST_PROXY=false` 默认不采信 `X-Forwarded-For` |
| 审计 | `app.auth_audit` 追加写（无 UPDATE/DELETE 策略）；登录成功/失败、登出、续期、强制下线全埋点 |
| 强制下线 | `manager/admin` + CSRF；`app.revoke_user_sessions` 在 DB 层再次校验角色（纵深防御） |

## 五、已知边界（非漏洞，但需知悉）

| 项 | 状态 |
|---|---|
| `pg_hba` 免密（trust） | 按“设备仅本人”接受；共享网络前需改为 `scram-sha-256` |
| 生产 TLS / 备份 / PITR / 监控 | 未完成 |
| 支付/退款/小票 | 未实现 |

## 六、部署安全清单（上线前必须）

- [ ] `SESSION_SECRET` 为独立强随机值（≥32 字节）
- [ ] `DEMO_ADMIN_PASSWORD` 已替换，演示账号已移除
- [ ] `COOKIE_SECURE=true`，API 与前端均启用 TLS
- [ ] `TRUST_PROXY=true` 仅在受信反向代理后启用
- [ ] 数据库连接使用最小权限角色，禁用 superuser
- [ ] `pg_hba` 使用 `scram-sha-256`，限制来源网段
- [ ] 备份/PITR 演练通过，监控与告警接入
- [ ] 登录审计、异常告警、会话强制下线能力就绪
- [ ] 依赖审计 0 high/critical
- [ ] 安全头（CSP、HSTS、X-Content-Type-Options）在网关配置

## 七、处理流程

```text
报告 → 确认 → 分级 → 复现 → 修复 → 回归测试 → 发布 → 协调披露与致谢
```

- 修复 PR 需 ≥ 2 人评审；
- 高危问题修复前不公开细节；
- 发布后更新 `SECURITY.md` 与 Release Notes。

## 八、安全研究许可

我们欢迎善意的安全研究：

- 仅测试你拥有或获得授权的环境；
- 不访问、修改或泄露他人数据；
- 不进行拒绝服务、社会工程或物理攻击；
- 给予合理修复时间后再公开。

---

> ***YanYuCloudCube***
> *言启象限 | 语枢未来*
> *万象归元于云枢 | 深栈智启新纪元*
