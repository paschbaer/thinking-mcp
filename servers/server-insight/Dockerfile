FROM node:22-slim

# glibc base (NOT alpine/musl): onnxruntime-node ships glibc-only
# prebuilt binaries (libonnxruntime.so needs ld-linux-x86-64.so.2) — the
# semantic retrieval arm cannot load on musl.

# Install curl for health check
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies deterministically from the committed lockfile
# (skip prepare script; ignore-scripts because better-sqlite3 is rebuilt
# explicitly below with platform-correct binaries)
RUN npm ci --ignore-scripts

# Build native module for the container platform, then the project
RUN npm rebuild better-sqlite3

# Copy source files
COPY . .

# Build the project
RUN npm run build

# Remove development dependencies
RUN npm prune --production

# Rebuild native bindings after prune (prune can drop the built binary;
# sharp — a transitive dependency of @xenova/transformers — also needs its
# install script run because npm ci used --ignore-scripts, otherwise
# importing the embedding provider fails on missing sharp binaries)
RUN npm rebuild better-sqlite3 sharp

# Bake the embedding model into the image: transformers.js v2 honors NO
# cache environment variable, so the bake step sets env.cacheDir exactly
# like the runtime (EMMS_MODEL_CACHE) — the pre-downloaded cache makes the
# semantic arm fully offline at runtime (one-time builder egress here).
ENV EMMS_MODEL_CACHE=/usr/src/app/.model-cache
RUN node -e "import('@xenova/transformers').then(async (m) => { m.env.cacheDir = process.env.EMMS_MODEL_CACHE; await m.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true }); console.log('embedding model baked'); })"

# Set executable permissions
RUN chmod +x dist/server.js

# Persistent volume for SQLite store + evidence artifacts
RUN mkdir -p /usr/src/app/data && chown node:node /usr/src/app/data
VOLUME ["/usr/src/app/data"]

# Default store inside the volume so plain `docker run` persists too
# (compose sets the same path explicitly)
ENV EMMS_STORAGE_PATH=/usr/src/app/data/emms-store.db

# Expose port
EXPOSE 3002

# Run as non-root user
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Start the HTTP server
CMD ["node", "dist/server.js"]

# Label the image
LABEL org.opencontainers.image.source="https://github.com/paschbaer/thinking-mcp/tree/main/servers/server-insight"
LABEL org.opencontainers.image.description="Experience Memory MCP server (EMMS) — evidence-backed long-term memory for coding agents"
LABEL org.opencontainers.image.licenses="MIT"
