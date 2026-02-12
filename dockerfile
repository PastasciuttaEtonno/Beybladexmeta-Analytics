## Production Dockerfile (multi-stage, optimized)

# ---- Builder stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Install git and configure safe.directory to avoid git safety errors during builds
RUN apk add --no-cache git \
    && git config --global --add safe.directory /app

# Copy package manifests and install all deps (including dev)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Declare build-time argument
ARG VITE_PUBLIC_MINIO_URL

# Make it available to the build script
ENV VITE_PUBLIC_MINIO_URL=$VITE_PUBLIC_MINIO_URL

# Force clean previous build artifacts
RUN rm -rf dist

# Increase Node.js memory limit for build (prevents OOM on resource-constrained environments)
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Build client and server bundles
RUN npm run build


# ---- Runner stage ----
FROM node:20-alpine AS runner
WORKDIR /app

# Environment
ENV NODE_ENV=production
ENV PORT=5000

# Pass the build-time arg to the runner environment
ARG VITE_PUBLIC_MINIO_URL
ENV VITE_PUBLIC_MINIO_URL=$VITE_PUBLIC_MINIO_URL

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Expose app port
EXPOSE 5000

# Healthcheck (optional)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "require('http').get(`http://localhost:${process.env.PORT}/`, res => { if (res.statusCode >= 200 && res.statusCode < 500) process.exit(0); else process.exit(1); }).on('error', () => process.exit(1))"

# Start the server
CMD ["node", "dist/index.js"]