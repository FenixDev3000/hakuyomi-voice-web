# Hakuyomi Voice Web (`hakuyomi-voice-web`)

Interfaz web en **React 18 + Vite 5** inspirada en una consola de estudio neuronal oscuro (*VOXIS / Hakuyomi Studio Pro*), conectada a `hakuyomi-voice-api`.

## Características Integradas

1. **Botón de Micrófono Interactivo en Tiempo Real (`ws://.../api/v1/stt/stream`)**:
   - Integrado directamente en la cabecera del área principal de texto.
   - Al presionarlo, captura el micrófono del navegador (PCM 16-bit a 16 kHz), envía los fragmentos en tiempo real por WebSocket y escribe la transcripción iterativa de `whisper-base` en vivo dentro del `<textarea>`.
   - Al presionarlo nuevamente, envía la señal de cierre (`stop`) y consolida la transcripción final.
2. **Panel Lateral "Archivos de Audio" (`POST /api/v1/stt/upload`)**:
   - Incluye zona interactiva **Drag & Drop** (arrastrar y soltar) y **botón de clip (`📎 Adjuntar`)** para subir audios pregrabados (`.mp3`, `.wav` hasta 10 MB).
   - Valida formato y peso antes de enviar e inserta automáticamente el texto transcrito en el editor principal.
3. **Spinners y Estados de Carga**:
   - Indicadores visuales animados (`.spinner`) durante la conexión/transcripción por WebSocket, la subida y procesamiento de archivos adjuntos (`whisper-base`) y la síntesis de voz (`piper-tts / VITS`).

## Ejecución Local

```bash
cp .env.example .env
npm install
npm run dev
```
