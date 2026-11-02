# Club-Ops API 服务（Hono/tsx）+ relay 复用镜像
FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 4000
CMD ["pnpm", "api:start"]
