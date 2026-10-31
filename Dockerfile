FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# La URL de la API entra en el build; el build falla si falta.
# AVISO: todo VITE_* queda visible en el bundle del navegador. Ver docs/PLAN.md (token).
ARG VITE_API_BASE_URL
ARG VITE_WS_BASE_URL
ARG VITE_API_AUTH_TOKEN
RUN test -n "$VITE_API_BASE_URL" && test -n "$VITE_WS_BASE_URL"
RUN npm run build

# Nginx sin privilegios (usuario nginx, puerto 8080)
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
