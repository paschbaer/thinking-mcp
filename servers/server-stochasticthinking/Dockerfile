FROM node:22-alpine

# Install curl for health check
RUN apk add --no-cache curl

# Create app directory
WORKDIR /usr/src/app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (skip prepare script)
RUN npm ci --ignore-scripts

# Fix CommonJS/ESM compatibility issue in Smithery SDK by inlining okay-error functions
RUN sed -i '2,3d' node_modules/@smithery/sdk/dist/shared/config.js && \
    sed -i '2i const ok = (value) => ({ ok: true, value });\nconst err = (error) => ({ ok: false, error });' node_modules/@smithery/sdk/dist/shared/config.js

# Copy source files
COPY . .

# Build the project
RUN npm run build

# Remove development dependencies
RUN npm prune --production

# Set executable permissions
RUN chmod +x dist/server.js

# On the host the HTTP server defaults to 3001 (side-by-side with
# clear-thought); inside the container it listens on 3000 to match
# EXPOSE and the health check.
ENV PORT=3000
# Container must listen on all interfaces for the port mapping; the host
# default is loopback (127.0.0.1) like the other servers.
ENV STOCHASTIC_BIND_HOST=0.0.0.0

# Expose port
EXPOSE 3000

# Run as non-root user
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the HTTP server
CMD ["node", "dist/server.js"]

# Label the image
LABEL org.opencontainers.image.source="https://github.com/paschbaer/thinking-mcp/tree/main/servers/server-stochasticthinking"
LABEL org.opencontainers.image.description="MCP server for stochastic algorithms and probabilistic decision making"
LABEL org.opencontainers.image.licenses="MIT"
