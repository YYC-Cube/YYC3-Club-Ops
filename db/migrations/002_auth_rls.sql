-- YYC³ Club Ops migration 002：认证表 RLS + 登录限流
-- 在 yyc3_club_ops / yyc3_club_ops_test 以 owner 角色执行（pnpm db:migrate[:test]）。
--
-- 设计要点：
-- 1) 登录前无法确定租户，因此 app_user/user_store 只 ENABLE RLS（owner 拥有 SECURITY DEFINER
--    登录查询函数可读）；tenant/store/session 使用 FORCE RLS。
-- 2) 应用角色通过函数获得最小必要能力：auth_lookup（按手机号精确取 1 行）、
--    hit/reset_login_throttle（限流）、prune_login_throttle（清理）。
-- 3) session 只允许本人（tenant_id + user_id 作用域）读写；过期会话允许被清理。
-- 4) 登录限流表不含任何最低权限直连授权，只能通过函数访问，避免手机号/IP 泄露。

BEGIN;

SET search_path = app, public;

-- ---------------------------------------------------------------------------
-- 1. 登录限流表与函数
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.login_throttle (
  scope text NOT NULL CHECK (scope IN ('ip', 'phone')),
  key text NOT NULL,
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);

CREATE INDEX IF NOT EXISTS idx_login_throttle_updated ON app.login_throttle (updated_at);

COMMENT ON TABLE app.login_throttle IS
  '登录限流计数（scope=ip/phone）；仅应用角色可通过 SECURITY DEFINER 函数访问，不授予直连权限。';

CREATE OR REPLACE FUNCTION app.hit_login_throttle(
  p_scope text,
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
RETURNS TABLE(allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_attempts integer;
  v_blocked_until timestamptz;
  v_retry integer;
BEGIN
  IF p_scope NOT IN ('ip', 'phone') THEN
    RAISE EXCEPTION 'invalid throttle scope: %', p_scope;
  END IF;
  IF p_limit < 1 OR p_window_seconds < 1 OR p_block_seconds < 1 THEN
    RAISE EXCEPTION 'invalid throttle parameters';
  END IF;

  -- 单条 UPSERT 完成“开窗 / 计数 / 超限封禁”的原子更新。
  INSERT INTO app.login_throttle AS t
    (scope, key, window_started_at, attempts, blocked_until, updated_at)
  VALUES (p_scope, p_key, v_now, 1, NULL, v_now)
  ON CONFLICT (scope, key) DO UPDATE SET
    window_started_at = CASE
      WHEN t.blocked_until IS NOT NULL AND t.blocked_until > v_now THEN t.window_started_at
      WHEN t.blocked_until IS NOT NULL THEN v_now
      WHEN t.window_started_at + make_interval(secs => p_window_seconds) <= v_now THEN v_now
      ELSE t.window_started_at
    END,
    attempts = CASE
      WHEN t.blocked_until IS NOT NULL AND t.blocked_until > v_now THEN t.attempts
      WHEN t.blocked_until IS NOT NULL THEN 1
      WHEN t.window_started_at + make_interval(secs => p_window_seconds) <= v_now THEN 1
      ELSE t.attempts + 1
    END,
    blocked_until = CASE
      WHEN t.blocked_until IS NOT NULL AND t.blocked_until > v_now THEN t.blocked_until
      WHEN t.blocked_until IS NOT NULL THEN NULL
      WHEN t.window_started_at + make_interval(secs => p_window_seconds) <= v_now THEN NULL
      WHEN t.attempts + 1 > p_limit THEN v_now + make_interval(secs => p_block_seconds)
      ELSE NULL
    END,
    updated_at = v_now
  RETURNING t.attempts, t.blocked_until INTO v_attempts, v_blocked_until;

  IF v_blocked_until IS NOT NULL AND v_blocked_until > v_now THEN
    v_retry := CEIL(EXTRACT(EPOCH FROM (v_blocked_until - v_now)))::integer;
    RETURN QUERY SELECT false, GREATEST(v_retry, 1);
  END IF;

  RETURN QUERY SELECT true, 0;
END;
$$;

CREATE OR REPLACE FUNCTION app.reset_login_throttle(p_scope text, p_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
  DELETE FROM app.login_throttle WHERE scope = p_scope AND key = p_key;
$$;

CREATE OR REPLACE FUNCTION app.prune_login_throttle(p_older_than_seconds integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_older_than_seconds < 60 THEN
    RAISE EXCEPTION 'invalid prune interval';
  END IF;

  DELETE FROM app.login_throttle
   WHERE updated_at < now() - make_interval(secs => p_older_than_seconds);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION app.hit_login_throttle(text, text, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reset_login_throttle(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.prune_login_throttle(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.hit_login_throttle(text, text, integer, integer, integer) TO yyc3_club_ops_app;
GRANT EXECUTE ON FUNCTION app.reset_login_throttle(text, text) TO yyc3_club_ops_app;
GRANT EXECUTE ON FUNCTION app.prune_login_throttle(integer) TO yyc3_club_ops_app;

-- ---------------------------------------------------------------------------
-- 2. 登录前查询：按手机号精确取 1 行（含门店绑定）
--    app_user / user_store 未 FORCE RLS，函数以 owner 身份读取；
--    函数仅返回 active 用户，且不接受任意过滤条件（防越权枚举）。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.auth_lookup(p_phone text)
RETURNS TABLE (
  id text,
  tenant_id text,
  name text,
  phone text,
  role text,
  password_salt text,
  password_hash text,
  permissions text[],
  store_ids text[],
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
  SELECT
    u.id,
    u.tenant_id,
    u.name,
    u.phone,
    u.role,
    u.password_salt,
    u.password_hash,
    u.permissions,
    COALESCE(
      (
        SELECT array_agg(us.store_id ORDER BY us.store_id)
          FROM app.user_store us
         WHERE us.user_id = u.id AND us.tenant_id = u.tenant_id
      ),
      ARRAY[]::text[]
    ) AS store_ids,
    u.created_at,
    u.updated_at
  FROM app.app_user u
  WHERE u.phone = p_phone
    AND u.status = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION app.auth_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.auth_lookup(text) TO yyc3_club_ops_app;

-- ---------------------------------------------------------------------------
-- 3. 认证表 RLS
--    作用域键：app.tenant_id / app.user_id（事务级 set_config）
-- ---------------------------------------------------------------------------

ALTER TABLE app.tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tenant FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_self_scope ON app.tenant;
CREATE POLICY tenant_self_scope ON app.tenant
  USING (id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE app.store ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_tenant_scope ON app.store;
CREATE POLICY store_tenant_scope ON app.store
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

-- app_user / user_store 仅 ENABLE（不 FORCE）：登录前无租户上下文，
-- 由 owner 的 SECURITY DEFINER auth_lookup 读取；应用角色仍受 RLS 约束。
ALTER TABLE app.app_user ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_user_tenant_scope ON app.app_user;
CREATE POLICY app_user_tenant_scope ON app.app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE app.user_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_store_tenant_scope ON app.user_store;
CREATE POLICY user_store_tenant_scope ON app.user_store
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE app.session ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.session FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_owner_select ON app.session;
CREATE POLICY session_owner_select ON app.session
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND user_id = NULLIF(current_setting('app.user_id', true), '')
  );

DROP POLICY IF EXISTS session_owner_insert ON app.session;
CREATE POLICY session_owner_insert ON app.session
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND user_id = NULLIF(current_setting('app.user_id', true), '')
  );

DROP POLICY IF EXISTS session_owner_update ON app.session;
CREATE POLICY session_owner_update ON app.session
  FOR UPDATE
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND user_id = NULLIF(current_setting('app.user_id', true), '')
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')
    AND user_id = NULLIF(current_setting('app.user_id', true), '')
  );

-- 过期会话清理：无需租户上下文，但只能删除已过期行。
DROP POLICY IF EXISTS session_expired_delete ON app.session;
CREATE POLICY session_expired_delete ON app.session
  FOR DELETE
  USING (expires_at <= now());

-- ---------------------------------------------------------------------------
-- 4. 权限收敛：app 不直连限流表；认证表仍是 SELECT（受 RLS 约束）
-- ---------------------------------------------------------------------------

REVOKE ALL ON app.login_throttle FROM PUBLIC;

GRANT SELECT ON app.tenant, app.store, app.app_user, app.user_store, app.session TO yyc3_club_ops_app;

COMMIT;
