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
# nginx-unprivileged e non nginx: l'immagine ufficiale tiene il processo
# master da root, e root nel container accorcia di un passo ogni catena di
# evasione. Questa gira da uid 101 dall'inizio.
#
# La porta resta la 80 e NON serve toccare Coolify: dentro un container Docker
# `net.ipv4.ip_unprivileged_port_start` vale 0, quindi anche un utente non
# privilegiato puo' legarsi alla 80. (L'immagine per suo conto userebbe la
# 8080, ma il template qui sotto sovrascrive default.conf e decide lui.)
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner

# nginx:alpine renders /etc/nginx/templates/*.template through envsubst on
# startup, so the backend upstream stays runtime-configurable.
# One upstream for the whole API. Kept as a variable so it can be repointed
# at runtime, though FastAPI is now the only backend there is.
ENV API_UPSTREAM=http://backend-py:8000 \
    PUBLIC_STORAGE_ORIGIN=""

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

# L'immagine di base gia' lascia uid 101, ma dichiararlo qui non e' ridondante:
# e' l'unica cosa che un controllo statico puo' vedere. Senza questa riga
# checkov e tools/conformita.py leggono un Dockerfile che tace sull'utente e
# devono presumere root - e avrebbero ragione a presumerlo, perche' un domani
# basta cambiare il FROM perche' diventi vero.
# Numerico e non `nginx` perche' un id numerico si risolve ovunque, anche dove
# /etc/passwd non ha quel nome.
USER 101

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
