-- YYC³ Club Ops migration 006：同步 Outbox 与商品版本
-- 依据：协同规范 03 §1（app.sync_outbox 逐字段对齐）、03 §3.6（master.* recordVersion）
-- 说明：
--   1) app.sync_outbox：业务事务内写入的事件事实源；sender 拉取后投递 CMS 并标记状态；
--   2) (tenant_id, idempotency_key) 唯一：业务重放不产生重复事件；
--   3) (aggregate_type, aggregate_id, sequence) 唯一：聚合根内严格递增，CMS 侧据此排序；
--   4) app.product 增加 version：App 是门店商品第一写入方，master.* 事件携带单调 recordVersion；
--   5) RLS：应用角色仅能读写本租户本门店的 Outbox 行。

BEGIN;

SET search_path = app, public;

-- ---------------------------------------------------------------------------
-- 1. app.sync_outbox（03 §1）
-- ---------------------------------------------------------------------------

-- 修正：初版误加 actor_id FK（超出 03 §1 契约）——已应用库幂等移除
ALTER TABLE app.sync_outbox DROP CONSTRAINT IF EXISTS sync_outbox_actor_id_fkey;

CREATE TABLE IF NOT EXISTS app.sync_outbox (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         text NOT NULL REFERENCES app.tenant(id),
  store_id          text NOT NULL REFERENCES app.store(id),
  aggregate_type    text NOT NULL,
  aggregate_id      text NOT NULL,
  event_type        text NOT NULL,
  event_version     int  NOT NULL DEFAULT 1,
  sequence          bigint NOT NULL,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  -- 03 §1 契约：actor_id 无 FK——操作者可能来自 CMS 纠正命令（外部 ID），保留原文审计
  actor_id          text,
  idempotency_key   text NOT NULL,
  payload           jsonb NOT NULL,
  payload_checksum  text NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sending','sent','failed','dead')),
  attempts          int NOT NULL DEFAULT 0,
  next_retry_at     timestamptz,
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  sent_at           timestamptz,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON app.sync_outbox (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate
  ON app.sync_outbox (aggregate_type, aggregate_id, sequence);

COMMENT ON TABLE app.sync_outbox IS 'App→CMS 事件 Outbox：与业务同事务写入；传输/重试/幂等见协同规范 03';
COMMENT ON COLUMN app.sync_outbox.payload_checksum IS 'sha256(canonical json)，防篡改/校验';

-- ---------------------------------------------------------------------------
-- 2. 商品版本列（master.product.* recordVersion）
-- ---------------------------------------------------------------------------

ALTER TABLE app.product ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;
COMMENT ON COLUMN app.product.version IS '记录版本：每次 App 写入 +1；master.* 事件携带为 recordVersion';

-- ---------------------------------------------------------------------------
-- 3. RLS（仅 ENABLE 不 FORCE：应用角色受租户/门店作用域约束；
--    中继以 owner 连接运行，需要跨门店拉取 pending 批次）
-- ---------------------------------------------------------------------------

ALTER TABLE app.sync_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_outbox_tenant_store_scope ON app.sync_outbox;
CREATE POLICY sync_outbox_tenant_store_scope ON app.sync_outbox
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND store_id = NULLIF(current_setting('app.store_id', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND store_id = NULLIF(current_setting('app.store_id', true), '')
  );

-- ---------------------------------------------------------------------------
-- 4. 授权（与 005 惯例一致）
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON app.sync_outbox TO yyc3_club_ops_app;
GRANT SELECT ON app.sync_outbox TO yyc3_club_ops_ro;

COMMIT;
