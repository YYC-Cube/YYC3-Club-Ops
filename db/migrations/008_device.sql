-- YYC³ Club Ops migration 008：门店设备域（device.update 命令的应用载体）
-- 依据：协同规范 08 §3.6（收银机/打印机/打印规则）、02 §6；CMS 侧 operational_cashier/printer 已建

BEGIN;

SET search_path = app, public;

CREATE TABLE IF NOT EXISTS app.device (
  id           text PRIMARY KEY,
  tenant_id    text NOT NULL REFERENCES app.tenant(id),
  store_id     text NOT NULL REFERENCES app.store(id) ON DELETE CASCADE,
  device_type  text NOT NULL CHECK (device_type IN ('cashier', 'printer')),
  name         text NOT NULL,
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'offline')),
  version      bigint NOT NULL DEFAULT 1,
  updated_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, name)
);

CREATE INDEX IF NOT EXISTS idx_device_store_type ON app.device (store_id, device_type, status);
COMMENT ON TABLE app.device IS '门店设备（收银机/打印机）：device.update 命令经 App 应用后回传 master.device.updated';

ALTER TABLE app.device ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_tenant_scope ON app.device;
CREATE POLICY device_tenant_scope ON app.device
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

GRANT SELECT, INSERT, UPDATE ON app.device TO yyc3_club_ops_app;
GRANT SELECT ON app.device TO yyc3_club_ops_ro;

COMMIT;
