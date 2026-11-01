#!/usr/bin/env bash
# ============================================================================
# 联合验收基线（部署前置检查一键化）——协同规范 05 门禁基线段的脚本化落地。
# 三件套：Club-Ops vitest → CMS jest → sync:e2e 全场景。
#
# 用法：bash scripts/acceptance.sh
#   CMS_REPO 环境变量可覆盖 CMS 仓路径（默认 ../YYC3-Clube-Management-System）
#
# 前置（[3/3] 步必需，缺失时脚本给出缺失清单）：
#   env 七件：APP_DATABASE_URL / CMS_DATABASE_URL / SYNC_CMS_EVENTS_URL /
#            SYNC_HMAC_ACCESS_KEY / SYNC_HMAC_SECRET / SYNC_TENANT_ID / SYNC_STORE_ID
#   服务一件：CMS dev 已起（pg 方言 + HMAC env）
#   详见 scripts/sync-e2e.mts 头注。凭据一律走环境变量，本脚本不回显任何值。
#
# 退出码：任一套件失败即非零（可作 CI/pre-deploy 门禁）。
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CMS_REPO="${CMS_REPO:-$ROOT/../YYC3-Clube-Management-System}"

fail() {
  echo ""
  echo "❌ ACCEPTANCE FAILED: $1"
  exit 1
}

echo "== [1/3] Club-Ops vitest =="
( cd "$ROOT" && pnpm exec vitest run ) || fail "Club-Ops vitest"
echo "✅ vitest 全绿"

echo ""
echo "== [2/3] CMS jest（全量门禁）=="
( cd "$CMS_REPO" && pnpm exec jest --ci ) || fail "CMS jest"
echo "✅ jest 全绿"

echo ""
echo "== [3/3] sync:e2e（13 场景）前置自检 =="
REQUIRED_ENV=(
  APP_DATABASE_URL CMS_DATABASE_URL SYNC_CMS_EVENTS_URL
  SYNC_HMAC_ACCESS_KEY SYNC_HMAC_SECRET SYNC_TENANT_ID SYNC_STORE_ID
)
missing=()
for key in "${REQUIRED_ENV[@]}"; do
  [ -z "${!key:-}" ] && missing+=("$key")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "缺失 env（${#missing[@]} 项）：${missing[*]}"
  echo "→ 在当前 shell 导出上述七件后重跑；CMS dev 需已起（pg 方言 + HMAC env）。"
  echo "→ 参考头注：scripts/sync-e2e.mts（凭据一律走环境变量，勿写入文件）。"
  fail "sync:e2e 前置不满足"
fi
( cd "$ROOT" && pnpm run sync:e2e ) || fail "sync:e2e"
echo "✅ sync:e2e 全绿"

echo ""
echo "🎉 ACCEPTANCE PASSED — 联合验收基线全通（$(date '+%Y-%m-%d %H:%M:%S')）"
