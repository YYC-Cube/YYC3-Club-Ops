import type { Metadata, Viewport } from "next"
import "../styles/globals.css"
import AppLayout from "@/components/layout/app-layout"

export const metadata: Metadata = {
  title: "YYC³ Club Ops · 多店 KTV 运营 SaaS",
  description: "面向多门店 KTV 的前台收银、包厢运营与经营分析 SaaS（开发预览版，非生产环境）",
  applicationName: "YYC³ Club Ops",
  openGraph: {
    title: "YYC³ Club Ops · 多店 KTV 运营 SaaS",
    description: "多门店 KTV 前台收银、包厢运营与经营分析（开发预览版）",
    type: "website",
    locale: "zh_CN",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#020617",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  )
}
