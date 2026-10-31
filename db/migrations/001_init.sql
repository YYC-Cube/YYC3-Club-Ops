-- YYC³ Club Ops schema v0.1
-- 在专用库 yyc3_club_ops / yyc3_club_ops_test 中以 owner 角色执行。
-- 多店 SaaS 约束：tenant_id + store_id；金额整数分；房间/订单/事件启用 RLS。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;

SET search_path = app, public;

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS app.tenant (
  id text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.store (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES app.tenant(id),
  code text NOT NULL,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  currency text NOT NULL DEFAULT 'CNY' CHECK (currency IN ('CNY')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS app.app_user (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES app.tenant(id),
  name text NOT NULL,
  phone text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'manager', 'cashier', 'waiter')),
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);

CREATE TABLE IF NOT EXISTS app.user_store (
  user_id text NOT NULL REFERENCES app.app_user(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES app.tenant(id),
  store_id text NOT NULL REFERENCES app.store(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, store_id)
);

CREATE TABLE IF NOT EXISTS app.session (
  sid uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES app.app_user(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES app.tenant(id),
  current_store_id text NOT NULL REFERENCES app.store(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.room (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES app.tenant(id),
  store_id text NOT NULL REFERENCES app.store(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('small', 'medium', 'large', 'vip', 'luxury')),
  status text NOT NULL CHECK (status IN ('available', 'occupied', 'reserved', 'cleaning', 'maintenance')),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  floor integer,
  capacity integer CHECK (capacity IS NULL OR capacity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, name)
);

CREATE TABLE IF NOT EXISTS app.room_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text NOT NULL UNIQUE,
  tenant_id text NOT NULL REFERENCES app.tenant(id),
  store_id text NOT NULL REFERENCES app.store(id),
  room_id text NOT NULL REFERENCES app.room(id),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  hourly_rate_cents integer NOT NULL CHECK (hourly_rate_cents >= 0),
  billable_hours integer CHECK (billable_hours IS NULL OR billable_hours >= 0),
  total_cents integer CHECK (total_cents IS NULL OR total_cents >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid')),
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS app.room_event (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES app.tenant(id),
  store_id text NOT NULL REFERENCES app.store(id),
  room_id text NOT NULL REFERENCES app.room(id),
  action text NOT NULL,
  actor_id text REFERENCES app.app_user(id),
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_tenant ON app.store (tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_store_user ON app.user_store (user_id);
CREATE INDEX IF NOT EXISTS idx_session_expires ON app.session (expires_at);
CREATE INDEX IF NOT EXISTS idx_room_store_status ON app.room (store_id, status);
CREATE INDEX IF NOT EXISTS idx_room_order_store_room ON app.room_order (store_id, room_id, status);
CREATE INDEX IF NOT EXISTS idx_room_event_store_room ON app.room_event (store_id, room_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_tenant_updated ON app.tenant;
CREATE TRIGGER trg_tenant_updated BEFORE UPDATE ON app.tenant
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
DROP TRIGGER IF EXISTS trg_store_updated ON app.store;
CREATE TRIGGER trg_store_updated BEFORE UPDATE ON app.store
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
DROP TRIGGER IF EXISTS trg_user_updated ON app.app_user;
CREATE TRIGGER trg_user_updated BEFORE UPDATE ON app.app_user
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
DROP TRIGGER IF EXISTS trg_room_updated ON app.room;
CREATE TRIGGER trg_room_updated BEFORE UPDATE ON app.room
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- RLS：业务表强制门店作用域；未设置 app.tenant_id / app.store_id 时拒绝。
ALTER TABLE app.room ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.room FORCE ROW LEVEL SECURITY;
ALTER TABLE app.room_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.room_order FORCE ROW LEVEL SECURITY;
ALTER TABLE app.room_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.room_event FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_store_scope ON app.room;
CREATE POLICY room_store_scope ON app.room
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND store_id = NULLIF(current_setting('app.store_id', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND store_id = NULLIF(current_setting('app.store_id', true), '')
  );

DROP POLICY IF EXISTS room_order_store_scope ON app.room_order;
CREATE POLICY room_order_store_scope ON app.room_order
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND store_id = NULLIF(current_setting('app.store_id', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND store_id = NULLIF(current_setting('app.store_id', true), '')
  );

DROP POLICY IF EXISTS room_event_store_scope ON app.room_event;
CREATE POLICY room_event_store_scope ON app.room_event
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND store_id = NULLIF(current_setting('app.store_id', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND store_id = NULLIF(current_setting('app.store_id', true), '')
  );

-- 权限：app 只做业务 DML；session 可增删改；ro 只读。
GRANT USAGE ON SCHEMA app TO yyc3_club_ops_app, yyc3_club_ops_ro;
GRANT SELECT ON app.tenant, app.store, app.app_user, app.user_store, app.room, app.room_order, app.room_event, app.session TO yyc3_club_ops_app;
GRANT INSERT, UPDATE, DELETE ON app.session TO yyc3_club_ops_app;
GRANT INSERT, UPDATE ON app.room, app.room_order, app.room_event TO yyc3_club_ops_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO yyc3_club_ops_app;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO yyc3_club_ops_ro;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA app TO yyc3_club_ops_ro;
