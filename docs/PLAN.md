# PLAN · hakuyomi-voice-web

Tipo: **Web** (React 18 + Vite 5), consume `hakuyomi-voice-api` por HTTP y WebSocket.

## Estado de alineación con el estándar HAKUYOMI (rama `chore/estandar-hakuyomi`)
- Build de Vite servido por Nginx sin privilegios (puerto interno 8080), con `HEALTHCHECK` y cabeceras de seguridad.
- `npm ci` con `package-lock.json`; la URL de la API entra como `build.args` y el build falla si falta.
- Compose compatible con `docker-compose` 1.29.2; `restart: always`; logs con rotación; `cap_drop: ALL`.

## Login y registro (rama `feat/login-registro`)
- Pantalla de inicio de sesión y de registro antes de la aplicación (`AuthGate`, `AuthScreen`).
- Access token corto solo en memoria; refresh token rotativo en `sessionStorage` (se borra al cerrar la pestaña). Si el access token vence, se renueva solo y se reintenta una vez.
- Ya no existe `VITE_API_AUTH_TOKEN`: ningún secreto viaja en el bundle.
- Limitación conocida: `sessionStorage` es legible por JavaScript; una cookie `HttpOnly` serían más resistentes a XSS pero requiere decidir dominio y CORS con Miyo.

## Pendiente (decisión de Miyo)
- Puerto definitivo y `WEB_BIND` para la VM (hoy `5173`).
- Pruebas E2E (Playwright) y lint no existen todavía.
- Recuperar contraseña no está implementado.
