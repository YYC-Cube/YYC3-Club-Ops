import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 当前仍以静态导出部署到 GitHub Pages；多店 SaaS 的服务端能力将在 Phase 2 迁移。
  output: "export",
  outputFileTracingRoot: projectRoot,
  images: {
    unoptimized: true,
  },
}

export default nextConfig
