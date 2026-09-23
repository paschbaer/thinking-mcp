FROM node:22-alpine

# Copy package files first for better layer caching
COPY package*.json ./

# Install deterministically from the server-local committed lockfile.
# (ignore-scripts: native/postinstall steps are handled explicitly below.)
RUN npm ci --no-audit --no-fund --ignore-scripts

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
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3003/health || exit 1

# Start the HTTP server (binds GUIDANCE_BIND_HOST, default loopback)
CMD ["node", "dist/server.js"]

# Label the image
LABEL org.opencontainers.image.source="https://github.com/paschbaer/thinking-mcp/tree/main/servers/server-guidance"
LABEL org.opencontainers.image.description="Guidance MCP server: configurable workflow orchestrator with Spec-Kit integration"
LABEL org.opencontainers.image.licenses="MIT"
