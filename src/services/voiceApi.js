/**
 * Cliente desacoplado de comunicación con hakuyomi-voice-api:
 * - POST /api/v1/stt/upload (Subida de archivos .mp3, .wav, .ogg, .m4a, .flac, .webm, etc. hasta 10 MB)
 * - WS   /api/v1/stt/stream (Streaming de micrófono en tiempo real con whisper-base)
 * - POST /api/v1/tts        (Síntesis de voz con piper-tts / VITS)
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL ||
  API_BASE_URL.replace(/^http/, "ws");

export const API_AUTH_TOKEN =
  import.meta.env.VITE_API_AUTH_TOKEN || "";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".ogg",
  ".opus",
  ".m4a",
  ".flac",
  ".webm",
  ".aac",
  ".wma",
  ".mp4",
  ".mpeg",
  ".mpga",
];

/**
 * Valida en cliente que el archivo cumpla con los formatos de audio soportados y peso máximo (10 MB).
 */
export function validateAudioAttachment(file) {
  if (!file) {
    throw new Error("No se ha seleccionado ningún archivo de audio.");
  }
  const lowerName = (file.name || "").toLowerCase();
  const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!hasValidExt) {
    throw new Error(
      `Formato no permitido (${file.name}). Formatos soportados: .mp3, .wav, .ogg, .opus, .m4a, .flac, .webm, .aac.`
    );
  }
  if (file.size <= 0) {
    throw new Error("El archivo de audio está vacío.");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(
      `El archivo (${sizeMb} MB) supera el límite máximo permitido de 10 MB.`
    );
  }
  return true;
}

/**
 * Envía un archivo de audio adjunto (.ogg, .mp3, .wav, etc.) a POST /api/v1/stt/upload.
 */
export async function uploadAudioForSTT(file, language = "es") {
  validateAudioAttachment(file);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("language", language);

  const response = await fetch(`${API_BASE_URL}/api/v1/stt/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_AUTH_TOKEN}`,
      "X-API-Key": API_AUTH_TOKEN,
    },
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = `Error HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.detail) {
        errorDetail =
          typeof errJson.detail === "string"
            ? errJson.detail
            : JSON.stringify(errJson.detail);
      }
    } catch {
      // Ignorar si no es JSON
    }
    throw new Error(errorDetail);
  }

  return await response.json();
}

/**
 * Solicita síntesis de voz (TTS) a POST /api/v1/tts y retorna el Blob WAV.
 */
export async function synthesizeTextToAudio(text, voice = "es_MX-cori-high") {
  const response = await fetch(`${API_BASE_URL}/api/v1/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_AUTH_TOKEN}`,
      "X-API-Key": API_AUTH_TOKEN,
    },
    body: JSON.stringify({ text, voice }),
  });

  if (!response.ok) {
    let errorDetail = `Error en síntesis TTS (HTTP ${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson?.detail) {
        errorDetail = errJson.detail;
      }
    } catch {
      // Ignorar
    }
    throw new Error(errorDetail);
  }

  return await response.blob();
}

/**
 * Convierte un Float32Array [-1.0, 1.0] de Web Audio API a PCM 16-bit mono (ArrayBuffer).
 */
function float32ToPCM16Buffer(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/**
 * Construye un Blob WAV reproducible en el navegador a partir de una lista de ArrayBuffers PCM16 mono.
 */
export function buildWavBlobFromPCM16Chunks(pcmChunks, sampleRate = 16000) {
  const totalBytes = pcmChunks.reduce((acc, buf) => acc + buf.byteLength, 0);
  if (totalBytes === 0) return null;

  const wavBuffer = new ArrayBuffer(44 + totalBytes);
  const view = new DataView(wavBuffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + totalBytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (PCM)
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, 1, true); // NumChannels = 1 (Mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeStr(36, "data");
  view.setUint32(40, totalBytes, true);

  const uint8Out = new Uint8Array(wavBuffer, 44);
  let offset = 0;
  for (const chunk of pcmChunks) {
    uint8Out.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  return new Blob([wavBuffer], { type: "audio/wav" });
}

/**
 * Gestor de grabación del micrófono en el navegador y streaming por WebSocket
 * hacia `ws://.../api/v1/stt/stream`. También conserva el audio grabado para reproducción local.
 */
export class RealtimeMicStreamer {
  constructor({
    language = "es",
    onTranscript,
    onStateChange,
    onRecordedBlob,
    onError,
  }) {
    this.language = language;
    this.onTranscript = onTranscript;
    this.onStateChange = onStateChange;
    this.onRecordedBlob = onRecordedBlob;
    this.onError = onError;

    this.ws = null;
    this.mediaStream = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.isRecording = false;
    this.recordedPCMChunks = [];
  }

  async start() {
    if (this.isRecording) return;
    this.recordedPCMChunks = [];

    this.onStateChange?.({
      isConnecting: true,
      isRecording: false,
      isInferring: false,
    });

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch {
      this.onStateChange?.({
        isConnecting: false,
        isRecording: false,
        isInferring: false,
      });
      throw new Error(
        "No se pudo acceder al micrófono del navegador. Verifica los permisos de audio."
      );
    }

    const wsUrl = `${WS_BASE_URL}/api/v1/stt/stream?lang=${encodeURIComponent(
      this.language
    )}&token=${encodeURIComponent(API_AUTH_TOKEN)}`;

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      socket.binaryType = "arraybuffer";
      this.ws = socket;

      socket.onopen = () => {
        try {
          this._startAudioCapture();
          this.isRecording = true;
          this.onStateChange?.({
            isConnecting: false,
            isRecording: true,
            isInferring: false,
          });
          resolve();
        } catch (captureErr) {
          this.cleanup();
          reject(captureErr);
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "partial_transcript" || data.type === "final_transcript") {
            this.onStateChange?.({
              isConnecting: false,
              isRecording: this.isRecording,
              isInferring: false,
            });
            this.onTranscript?.(data);
          } else if (data.type === "error") {
            this.onStateChange?.({
              isConnecting: false,
              isRecording: this.isRecording,
              isInferring: false,
            });
            this.onError?.(data.detail || "Error en el stream STT.");
          }
        } catch {
          // Ignorar tramas no JSON
        }
      };

      socket.onerror = () => {
        const msg =
          "Error de conexión WebSocket con ws://.../api/v1/stt/stream.";
        this.onError?.(msg);
      };

      socket.onclose = () => {
        this.cleanup();
      };
    });
  }

  _startAudioCapture() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioCtx({ sampleRate: 16000 });
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

    let chunksSentSinceInfer = 0;

    this.processorNode.onaudioprocess = (audioEvent) => {
      if (!this.isRecording) return;
      const inputData = audioEvent.inputBuffer.getChannelData(0);
      const pcm16Buffer = float32ToPCM16Buffer(inputData);
      this.recordedPCMChunks.push(pcm16Buffer);

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(pcm16Buffer);
      }

      chunksSentSinceInfer += 1;
      if (chunksSentSinceInfer >= 6) {
        chunksSentSinceInfer = 0;
        this.onStateChange?.({
          isConnecting: false,
          isRecording: true,
          isInferring: true,
        });
      }
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);
  }

  stop() {
    if (!this.isRecording && !this.ws) return;

    this.isRecording = false;
    this._stopAudioNodes();

    // Generar Blob WAV del micrófono grabado para poder reproducirlo en la web
    if (this.recordedPCMChunks.length > 0) {
      const wavBlob = buildWavBlobFromPCM16Chunks(this.recordedPCMChunks, 16000);
      if (wavBlob) {
        this.onRecordedBlob?.(wavBlob);
      }
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.onStateChange?.({
        isConnecting: false,
        isRecording: false,
        isInferring: true,
      });
      try {
        this.ws.send(JSON.stringify({ action: "stop", language: this.language }));
      } catch {
        this.cleanup();
      }
      setTimeout(() => {
        this.cleanup();
      }, 1500);
    } else {
      this.cleanup();
    }
  }

  _stopAudioNodes() {
    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {
        // ignore
      }
      this.processorNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  cleanup() {
    this.isRecording = false;
    this._stopAudioNodes();
    if (this.ws) {
      try {
        if (
          this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING
        ) {
          this.ws.close(1000, "Client stopped recording");
        }
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.onStateChange?.({
      isConnecting: false,
      isRecording: false,
      isInferring: false,
    });
  }
}
