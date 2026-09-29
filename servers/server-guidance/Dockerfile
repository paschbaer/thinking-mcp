FROM node:24-trixie-slim

# node 24 on purpose: the WSL host (nvm) runs node 24 and builds the shared
# /workspace native modules with NODE_MODULE_VERSION 137 — a node 22 container
# (ABI 127) cannot load them (ERR_DLOPEN_FAILED ABI mismatch, TMPL-2).
# glibc base (Debian 13 trixie, glibc 2.41 — matches the WSL host that builds
# the shared /workspace node_modules): musl (alpine) cannot dlopen host-built
# native bindings (better-sqlite3 fcntl64, TMPL-2).
# curl: health check · git, bash: workspace verification ops spawn them
# (git init in tests, `spawn bash` in process gates) — must happen before USER node
RUN apt-get update \
  && apt-get install --no-install-recommends -y curl git bash ca-certificates python3 python3-pip procps \
  && rm -rf /var/lib/apt/lists/*

# Python toolchain bootstrap (spec 003 FR-105): interpreter + pinned uv binary.
# Project dependencies are NOT baked into the image — they are installed
# lazily, server-side, from the workspace lockfile (uv sync --locked).
# Update UV_VERSION deliberately (manual upgrade procedure, keep in sync
# with the README note).
ARG UV_VERSION=0.12.19
RUN pip install --break-system-packages --no-cache-dir "uv==${UV_VERSION}"

# --- Optional toolchains: Rust + C# ------------------------------------------------
# Neither toolchain is installed by default (image size). Opt in per build:
#   docker build --build-arg INSTALL_RUST=true --build-arg INSTALL_CSHARP=true .
# If an operation references cargo/dotnet without the toolchain installed,
# the process gate fails closed (executable not found).
ARG INSTALL_RUST=false
ARG INSTALL_CSHARP=false

# Rust toolchain bootstrap (analogous to uv): pinned rustup-init + minimal
# stable toolchain. Project dependencies are NOT baked in — they are fetched
# lazily, server-side, from the workspace Cargo.lock (cargo fetch --locked).
# Workspace repos should pin their own toolchain via rust-toolchain.toml
# (rustup resolves it automatically). Update RUST_VERSION deliberately.
ARG RUST_VERSION=1.90.0
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:${PATH}
RUN if [ "$INSTALL_RUST" = "true" ]; then \
      curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
        | sh -s -- -y --profile minimal --default-toolchain "${RUST_VERSION}" --no-modify-path; \
    else echo "INSTALL_RUST=false — skipping Rust toolchain"; fi

# C# toolchain bootstrap (analogous to uv/rustup): pinned .NET SDK channel.
# Project dependencies are NOT baked in — they are restored lazily,
# server-side, from the workspace packages.lock.json (dotnet restore
# --locked-mode). Update DOTNET_VERSION deliberately.
ARG DOTNET_VERSION=10.0
ENV DOTNET_ROOT=/usr/share/dotnet \
    PATH=/usr/share/dotnet:${PATH} \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1
RUN if [ "$INSTALL_CSHARP" = "true" ]; then \
      curl -sSL https://dot.net/v1/dotnet-install.sh \
        | bash -s -- --channel "${DOTNET_VERSION}" --install-dir /usr/share/dotnet; \
    else echo "INSTALL_CSHARP=false — skipping .NET SDK"; fi

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
