# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_* variables are baked into the bundle at build time, so they must be
# build args. Changing any of them requires a rebuild, not just a restart.
ARG VITE_PUBLIC_MINIO_URL
ARG VITE_RECAPTCHA_SITE_KEY
ARG VITE_RECAPTCHA_USE_ENTERPRISE
ENV VITE_PUBLIC_MINIO_URL=$VITE_PUBLIC_MINIO_URL \
    VITE_RECAPTCHA_SITE_KEY=$VITE_RECAPTCHA_SITE_KEY \
    VITE_RECAPTCHA_USE_ENTERPRISE=$VITE_RECAPTCHA_USE_ENTERPRISE

RUN npm run build


# ---- Runtime stage ----
FROM nginx:1.27-alpine AS runner

# nginx:alpine renders /etc/nginx/templates/*.template through envsubst on
# startup, so the backend upstream stays runtime-configurable.
ENV BACKEND_UPSTREAM=http://backend:5000 \
    PUBLIC_STORAGE_ORIGIN=""

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
