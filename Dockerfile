## Multi-stage build for production

# ---- Builder stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Install OS packages if needed (none for now)

# Copy package manifests and install all deps (including dev)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Build client and server bundles
RUN npm run build


# ---- Runner stage ----
FROM node:20-alpine AS runner
WORKDIR /app

# Environment
ENV NODE_ENV=production
ENV PORT=5000

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Expose app port
EXPOSE 5000

# Healthcheck (optional but helpful for orchestrators like Coolify)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get(`http://localhost:${process.env.PORT}/`, res => { if (res.statusCode >= 200 && res.statusCode < 500) process.exit(0); else process.exit(1); }).on('error', () => process.exit(1))"

# Start the server
CMD ["node", "dist/index.js"]