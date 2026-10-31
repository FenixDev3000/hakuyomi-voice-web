# PLAN · hakuyomi-voice-web

Tipo: **Web** (React 18 + Vite 5), consume `hakuyomi-voice-api` por HTTP y WebSocket.

## Estado de alineación con el estándar HAKUYOMI (rama `chore/estandar-hakuyomi`)
- Build de Vite servido por Nginx sin privilegios (puerto interno 8080), con `HEALTHCHECK` y cabeceras de seguridad.
- `npm ci` con `package-lock.json`; la URL de la API entra como `build.args` y el build falla si falta.
- Compose compatible con `docker-compose` 1.29.2; `restart: always`; logs con rotación; `cap_drop: ALL`.

## Pendiente (decisión de Miyo)
- **Token en el bundle:** `VITE_API_AUTH_TOKEN` queda visible para cualquiera que abra la web. Sirve solo para pruebas locales; antes de publicar la API necesita autenticación real de usuario (login + token corto).
- Puerto definitivo y `WEB_BIND` para la VM (hoy `5173`).
- Pruebas (Vitest/Playwright) y lint no existen todavía.
