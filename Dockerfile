# ---- 构建阶段 ----
FROM --platform=linux/arm64 docker.m.daocloud.io/library/node:20.19.5-bookworm-slim AS builder

WORKDIR /app

# 使用阿里云 npm 镜像
RUN npm config set registry https://registry.npmmirror.com

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- 运行阶段 ----
FROM --platform=linux/arm64 docker.m.daocloud.io/library/node:20.19.5-bookworm-slim

WORKDIR /app

# 使用阿里云 Debian 镜像
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

# 使用阿里云 npm 镜像
RUN npm config set registry https://registry.npmmirror.com

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY scripts ./scripts

EXPOSE 3000

CMD ["dumb-init", "node", "dist/server.js"]
