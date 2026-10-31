-- YYC³ Club Ops migration 004：登录/会话审计 + 管理员强制下线
-- 在 yyc3_club_ops / yyc3_club_ops_test 以 owner 角色执行（pnpm db:migrate[:test]）。
--
-- 设计要点：
-- 1) auth_audit 为追加写审计表：应用角色仅授予 SELECT/INSERT，无 UPDATE/DELETE 权限，
--    且 FORCE RLS 下未声明更新/删除策略 → 任何角色（含 owner 函数之外）不可篡改历史。
-- 2) 登录失败时租户可能未知（手机号不存在）→ tenant_id 允许为空；
--    插入策略用 IS NOT DISTINCT FROM 同时放行「登录前空租户」与「本租户」两种情况，
--    并拒绝跨租户写入；SELECT 仅对本租户（tenant_id 非空的行）可见，空租户行仅 owner 可查。
-- 3) 强制下线通过 SECURITY DEFINER 函数 revoke_user_sessions 完成（会话表 FORCE RLS，
--    管理员作用域只覆盖本人会话，无法直接 UPDATE 目标用户会话）：
--    函数内先以 owner 身份校验操作者角色（manager/admin，纵深防御），
--    再把事务作用域临时切换为目标用户后执行撤销，返回撤销的会话数量。

BEGIN;

SET search_path = app, public;

-- ---------------------------------------------------------------------------
-- 1. 审计表
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.auth_audit (
  id bigserial PRIMARY KEY,
  tenant_id text,
  user_id text,
  actor_id text,
  phone text,
  event text NOT NULL CHECK (event IN (
    'login_success', 'login_failure', 'logout', 'session_refresh', 'force_logout'
  )),
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_tenant_created
  ON app.auth_audit (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_user_created
  ON app.auth_audit (user_id, created_at DESC);

COMMENT ON TABLE app.auth_audit IS
  '登录/会话安全审计（追加写）；应用角色仅可按租户作用域查询与插入，不可更新/删除。';

-- ---------------------------------------------------------------------------
-- 2. RLS：租户作用域查询 + 租户/登录前写入；不声明 UPDATE/DELETE 策略（不可篡改）
-- ---------------------------------------------------------------------------

ALTER TABLE app.auth_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.auth_audit FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_audit_tenant_select ON app.auth_audit;
CREATE POLICY auth_audit_tenant_select ON app.auth_audit
  FOR SELECT
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

DROP POLICY IF EXISTS auth_audit_tenant_insert ON app.auth_audit;
CREATE POLICY auth_audit_tenant_insert ON app.auth_audit
  FOR INSERT
  WITH CHECK (tenant_id IS NOT DISTINCT FROM NULLIF(current_setting('app.tenant_id', true), ''));

-- ---------------------------------------------------------------------------
-- 3. 强制下线函数：DB 层校验操作者角色，撤销目标用户全部有效会话
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.revoke_user_sessions(
  p_actor_id text,
  p_tenant_id text,
  p_user_id text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
  v_role text;
  v_count integer;
BEGIN
  SELECT role INTO v_role
    FROM app.app_user
   WHERE id = p_actor_id
     AND tenant_id = p_tenant_id
     AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('manager', 'admin') THEN
    RAISE EXCEPTION 'force logout requires manager or admin role';
  END IF;

  -- session 为 FORCE RLS：把事务级作用域临时切换到目标用户，使撤销策略成立。
  PERFORM set_config('app.tenant_id', p_tenant_id, true);
  PERFORM set_config('app.user_id', p_user_id, true);

  UPDATE app.session
     SET revoked_at = now()
   WHERE tenant_id = p_tenant_id
     AND user_id = p_user_id
     AND revoked_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION app.revoke_user_sessions(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.revoke_user_sessions(text, text, text) TO yyc3_club_ops_app;

-- ---------------------------------------------------------------------------
-- 4. 权限：仅查询与追加写（序列用于 bigserial 默认值）
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT ON app.auth_audit TO yyc3_club_ops_app;
GRANT USAGE, SELECT ON SEQUENCE app.auth_audit_id_seq TO yyc3_club_ops_app;

COMMIT;
