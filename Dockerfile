# ---- 构建阶段 ----
FROM --platform=linux/arm64 node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- 运行阶段 ----
FROM --platform=linux/arm64 node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY scripts ./scripts

EXPOSE 3000

CMD ["dumb-init", "node", "dist/server.js"]
