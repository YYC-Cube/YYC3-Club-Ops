-- YYC³ Club Ops migration 003：会话 CSRF Token + 刷新支持
-- 说明：
--   1) 每个服务端会话拥有独立 csrf_token，前端通过 X-CSRF-Token 回传；
--   2) 旧会话迁移时轮换为新随机值（前端重新拉取 /auth/session 即可拿到）；
--   3) 刷新沿用同一 token，有效期由 session.expires_at 控制，绝对上限由应用层判断。

BEGIN;

SET search_path = app, public;

-- 认证表为 FORCE RLS；迁移期间临时关闭 FORCE 以便轮换历史行，结束立即恢复。
ALTER TABLE app.session NO FORCE ROW LEVEL SECURITY;

ALTER TABLE app.session ADD COLUMN IF NOT EXISTS csrf_token text;

UPDATE app.session
   SET csrf_token = encode(gen_random_bytes(32), 'hex')
 WHERE csrf_token IS NULL;

ALTER TABLE app.session ALTER COLUMN csrf_token SET NOT NULL;

ALTER TABLE app.session FORCE ROW LEVEL SECURITY;

COMMIT;
