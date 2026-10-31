"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { apiClient } from "@/lib/api/client"
import { runtimeConfig } from "@/lib/config/runtime"
import { useStoreContextStore } from "@/lib/stores/useStoreContextStore"

export default function LoginPage() {
  const router = useRouter()
  const loadSession = useStoreContextStore((state) => state.loadSession)
  const [username, setUsername] = useState(runtimeConfig.useMock ? "13800138000" : "")
  const [password, setPassword] = useState(runtimeConfig.useMock ? "yyc3-demo-2026" : "")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!username.trim() || !password) {
      setError("请输入账号和密码")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await apiClient.login(username.trim(), password)
      await loadSession(undefined, { force: true })
      router.replace("/rooms")
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败，请重试")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6"
      >
        <div>
          <h1 className="text-xl font-bold">登录 YYC³ Club Ops</h1>
          <p className="mt-1 text-xs text-slate-400">多店 SaaS 开发预览 · 会话由服务端 HttpOnly Cookie 管理</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="username" className="text-xs text-slate-400">
            账号（手机号）
          </label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-xs text-slate-400">
            密码
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          />
        </div>

        {error ? (
          <div role="alert" className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "登录中..." : "登录"}
        </Button>

        {runtimeConfig.useMock ? (
          <p className="text-[10px] text-slate-500">Mock 模式演示账号：13800138000 / yyc3-demo-2026</p>
        ) : null}
      </form>
    </div>
  )
}
