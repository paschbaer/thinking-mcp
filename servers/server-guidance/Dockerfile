FROM node:22-alpine

# curl: health check · git, bash: workspace verification ops spawn them
# (git init in tests, `spawn bash` in process gates) — must happen before USER node
RUN apk add --no-cache curl git bash

# Python toolchain bootstrap (spec 003 FR-105): interpreter + pinned uv binary.
# Project dependencies are NOT baked into the image — they are installed
# lazily, server-side, from the workspace lockfile (uv sync --locked).
# Update UV_VERSION deliberately (manual upgrade procedure, keep in sync
# with the README note).
ARG UV_VERSION=0.12.19
RUN apk add --no-cache python3 py3-pip \
  && pip install --break-system-packages --no-cache-dir "uv==${UV_VERSION}"

# Copy package files first for better layer caching
COPY package*.json ./

# Install deterministically from the server-local committed lockfile.
# (ignore-scripts: native/postinstall steps are handled explicitly below.)
RUN npm ci --no-audit --no-fund --ignore-scripts

# corepack-pnpm shim: workspace repos pin their own packageManager (e.g. Niyama
# pnpm@12.4.2) — invoking `pnpm` inside a mounted workspace then resolves that
# pinned version automatically; no pnpm version is baked into the image.
# Shim must exist before USER node; the corepack cache under the node user's
# home is populated lazily on first use inside a workspace.
RUN corepack enable pnpm

# Copy source files
COPY . .

# Build the project
RUN npm run build

# Remove development dependencies
RUN npm prune --production

RUN chmod +x dist/server.js dist/index.js

# Workspace mountpoint: .guidance/ (config + state) must live here
RUN mkdir -p /workspace && chown node:node /workspace
VOLUME ["/workspace"]

# HTTP endpoint
EXPOSE 3003

# Run as non-root user
USER node

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3003/health || exit 1

# Start the HTTP server (binds GUIDANCE_BIND_HOST, default loopback)
CMD ["node", "dist/server.js"]

# Label the image
LABEL org.opencontainers.image.source="https://github.com/paschbaer/thinking-mcp/tree/main/servers/server-guidance"
LABEL org.opencontainers.image.description="Guidance MCP server: configurable workflow orchestrator with Spec-Kit integration"
LABEL org.opencontainers.image.licenses="MIT"
