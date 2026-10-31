-- YYC³ Club Ops migration 005：POS 点单与结账闭环
-- 说明：
--   1) app.product：门店价目表（整数分），按 tenant + store 强制 RLS；
--   2) app.room_order_item：房间订单消费明细（点单/退单），快照单价与名称，避免改价影响历史账单；
--   3) app.room_order 增加结账账单元数据：payment_method / room_cents / items_cents，
--      total_cents 保持为「房费 + 商品」合计；
--   4) 商品库存扣减在应用层事务内完成（同一事务 + FOR UPDATE），保证与点单原子性。

BEGIN;

SET search_path = app, public;

-- ---------------------------------------------------------------------------
-- 1. 商品价目表
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.product (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES app.tenant(id),
  store_id text NOT NULL REFERENCES app.store(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  unit text NOT NULL DEFAULT '个',
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  member_price_cents integer CHECK (member_price_cents IS NULL OR member_price_cents >= 0),
  cost_cents integer CHECK (cost_cents IS NULL OR cost_cents >= 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, name)
);

CREATE INDEX IF NOT EXISTS idx_product_store_status ON app.product (store_id, status, category);

DROP TRIGGER IF EXISTS trg_product_updated ON app.product;
CREATE TRIGGER trg_product_updated BEFORE UPDATE ON app.product
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. 房间订单消费明细
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.room_order_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES app.tenant(id),
  store_id text NOT NULL REFERENCES app.store(id),
  order_id uuid NOT NULL REFERENCES app.room_order(id) ON DELETE CASCADE,
  product_id text REFERENCES app.product(id),
  name_snapshot text NOT NULL,
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  is_gift boolean NOT NULL DEFAULT false,
  created_by text REFERENCES app.app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_item_order ON app.room_order_item (order_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. 结账账单元数据
-- ---------------------------------------------------------------------------

ALTER TABLE app.room_order ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE app.room_order ADD COLUMN IF NOT EXISTS room_cents integer;
ALTER TABLE app.room_order ADD COLUMN IF NOT EXISTS items_cents integer;

ALTER TABLE app.room_order DROP CONSTRAINT IF EXISTS room_order_payment_method_check;
ALTER TABLE app.room_order ADD CONSTRAINT room_order_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'wechat', 'alipay', 'member_card', 'card'));

-- ---------------------------------------------------------------------------
-- 4. RLS：与业务表一致的门店作用域（FORCE）
-- ---------------------------------------------------------------------------

ALTER TABLE app.product ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.product FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_store_scope ON app.product;
CREATE POLICY product_store_scope ON app.product
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND store_id = NULLIF(current_setting('app.store_id', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND store_id = NULLIF(current_setting('app.store_id', true), '')
  );

ALTER TABLE app.room_order_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.room_order_item FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_item_store_scope ON app.room_order_item;
CREATE POLICY order_item_store_scope ON app.room_order_item
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND store_id = NULLIF(current_setting('app.store_id', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND store_id = NULLIF(current_setting('app.store_id', true), '')
  );

-- ---------------------------------------------------------------------------
-- 5. 权限收敛
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON app.product TO yyc3_club_ops_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.room_order_item TO yyc3_club_ops_app;
GRANT SELECT ON app.product, app.room_order_item TO yyc3_club_ops_ro;

COMMIT;
