import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // 惰性初始化（SSR 安全）：避免 effect 内同步 setState 触发级联渲染（react-hooks/set-state-in-effect）
  const [isMobile, setIsMobile] = React.useState<boolean>(() =>
    typeof window === "undefined" ? false : window.innerWidth < MOBILE_BREAKPOINT,
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
