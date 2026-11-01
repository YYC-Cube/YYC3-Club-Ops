-- YYC³ Club Ops migration 007：门店设置域（settings.update 命令的应用载体）
-- 依据：协同规范 08 §3.6（store_settings 域）、02 §6（命令通道）；CMS 侧 operational_settings 投影对齐
-- 说明：同一 (store, domain) 单行聚合；config 为该域开关/参数 JSONB；version 供 master.settings.updated 携带。

BEGIN;

SET search_path = app, public;

CREATE TABLE IF NOT EXISTS app.store_settings (
  store_id     text PRIMARY KEY REFERENCES app.store(id) ON DELETE CASCADE,
  config       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  version      bigint      NOT NULL DEFAULT 1,
  updated_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.store_settings IS '门店设置聚合（writer=app；CMS settings.update 命令经 App 应用后回传 master.settings.updated）';
COMMENT ON COLUMN app.store_settings.config IS '门店级设置集合（支付/预订/打印/库存/报表/任务等开关与参数）';

ALTER TABLE app.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_settings_tenant_scope ON app.store_settings;
CREATE POLICY store_settings_tenant_scope ON app.store_settings
  USING (store_id IN (
    SELECT s.id FROM app.store s
     WHERE s.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  ))
  WITH CHECK (store_id IN (
    SELECT s.id FROM app.store s
     WHERE s.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
  ));

GRANT SELECT, INSERT, UPDATE ON app.store_settings TO yyc3_club_ops_app;
GRANT SELECT ON app.store_settings TO yyc3_club_ops_ro;

COMMIT;
