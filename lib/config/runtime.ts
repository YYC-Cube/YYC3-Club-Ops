/**
 * 运行模式配置：集中读取 NEXT_PUBLIC_*，避免各处直接散落 process.env。
 */
export const runtimeConfig = {
  useMock: process.env.NEXT_PUBLIC_USE_MOCK === "true",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
} as const
