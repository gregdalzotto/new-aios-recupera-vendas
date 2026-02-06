# Multi-stage Dockerfile for SARA Agent
# Optimized for production deployment
# Image size: ~250MB (vs ~900MB with single-stage)

# ==============================================================================
# STAGE 1: Builder
# Purpose: Compile TypeScript and prepare production assets
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /build

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --prefer-offline --no-audit

# Copy source code
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations

# Compile TypeScript
RUN npm run build

# ==============================================================================
# STAGE 2: Runtime
# Purpose: Minimal production image with compiled code only
# ==============================================================================
FROM node:20-alpine

# Set environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy package files for production dependencies
COPY package*.json ./

# Install production dependencies only
RUN npm ci --prefer-offline --no-audit --production

# Copy compiled code from builder stage
COPY --from=builder --chown=nodejs:nodejs /build/dist ./dist

# Copy migrations (needed for runtime)
COPY --chown=nodejs:nodejs migrations ./migrations

# Change ownership of node_modules
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["node", "dist/index.js"]
