FROM node:22-alpine

# Install curl for health check
RUN apk add --no-cache curl

# Create app directory
WORKDIR /usr/src/app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (skip prepare script; ignore-scripts because
# better-sqlite3 is rebuilt explicitly below with platform-correct binaries)
RUN npm install --ignore-scripts --no-audit --no-fund

# Build native module for the container platform, then the project
RUN npm rebuild better-sqlite3

# Fix CommonJS/ESM compatibility issue in Smithery SDK by inlining okay-error functions
RUN sed -i '2,3d' node_modules/@smithery/sdk/dist/shared/config.js && \
    sed -i '2i const ok = (value) => ({ ok: true, value });\nconst err = (error) => ({ ok: false, error });' node_modules/@smithery/sdk/dist/shared/config.js

# Copy source files
COPY . .

# Build the project
RUN npm run build

# Remove development dependencies
RUN npm prune --production

# Rebuild native bindings after prune (prune can drop the built binary)
RUN npm rebuild better-sqlite3

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
LABEL org.opencontainers.image.source="https://github.com/paschbaer/thinking-mcp/tree/main/servers/insight"
LABEL org.opencontainers.image.description="Experience Memory MCP server (EMMS) — evidence-backed long-term memory for coding agents"
LABEL org.opencontainers.image.licenses="MIT"
