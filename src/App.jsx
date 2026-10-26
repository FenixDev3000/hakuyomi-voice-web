import React, { useState, useRef, useEffect } from "react";
import {
  RealtimeMicStreamer,
  uploadAudioForSTT,
  synthesizeTextToAudio,
  validateAudioAttachment,
} from "./services/voiceApi.js";
import "./App.css";

const VOICE_BANK = [
  {
    id: "es_MX-ald-medium",
    flag: "🇲🇽",
    label: "Latino (es-MX) ALD — Piper/VITS ♂",
  },
  {
    id: "es_ES-davefx-medium",
    flag: "🇪🇸",
    label: "Español (es-ES) DAVEFX — Piper/VITS ♂",
  },
  {
    id: "es_ES-sharvard-medium",
    flag: "🇪🇸",
    label: "Española (es-ES) DORA — Neuronal ♀",
  },
  {
    id: "es_LAT-camila-medium",
    flag: "🌎",
    label: "Latina (es-LAT) CAMILA — Neuronal ♀",
  },
  {
    id: "es_LAT-lucas-medium",
    flag: "🌎",
    label: "Latino (es-LAT) LUCAS — Neuronal ♂",
  },
];

const DEFAULT_DSP = {
  preset: "Neutro (Bypass)",
  speed: 1.0,
  pitch: 0,
  bass: 0,
  treble: 0,
  delay: 0,
  reverb: 0,
  volume: 100,
};

export default function App() {
  // Texto principal e historial base antes del dictado en vivo
  const [text, setText] = useState(
    "¡Hola! Este es un ejemplo de texto que será convertido a voz o transcrito en tiempo real con Hakuyomi Voice Studio Pro."
  );
  const baseTextBeforeMicRef = useRef("");

  // Idioma y Banco de Voces
  const [language, setLanguage] = useState("es");
  const [selectedVoice, setSelectedVoice] = useState(VOICE_BANK[0].id);
  const [dsp, setDsp] = useState(DEFAULT_DSP);

  // Estado de Micrófono en Tiempo Real (WebSocket /api/v1/stt/stream)
  const [micState, setMicState] = useState({
    isConnecting: false,
    isRecording: false,
    isInferring: false,
  });
  const [wsIteration, setWsIteration] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const micStreamerRef = useRef(null);

  // Estado del Panel "Archivos de Audio" (POST /api/v1/stt/upload)
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploadingSTT, setIsUploadingSTT] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const fileInputRef = useRef(null);

  // Estado de Síntesis TTS (POST /api/v1/tts) y Reproductor
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioPlayerRef = useRef(null);

  // Mensajes de estado y alertas
  const [statusMessage, setStatusMessage] = useState(
    "Listo. Modelos ligeros activos: whisper-base (~140MB) + piper-tts (~150MB)."
  );
  const [errorMessage, setErrorMessage] = useState("");

  // Contador de tiempo de grabación en vivo
  useEffect(() => {
    if (!micState.isRecording) {
      setRecordingSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [micState.isRecording]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      micStreamerRef.current?.cleanup();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Métricas de palabras y caracteres
  const trimmed = text.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const charCount = text.length;

  const formatTimer = (secs) => {
    const mins = String(Math.floor(secs / 60)).padStart(2, "0");
    const rem = String(secs % 60).padStart(2, "0");
    return `${mins}:${rem}`;
  };

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // =========================================================================
  // 1. MICRÓFONO INTERACTIVO EN TIEMPO REAL (WS /api/v1/stt/stream)
  // =========================================================================
  const handleToggleMicrophone = async () => {
    setErrorMessage("");

    // Si ya está grabando o conectando -> detener grabación al presionarlo de nuevo
    if (micState.isRecording || micState.isConnecting) {
      setStatusMessage("Deteniendo grabación y consolidando transcripción final...");
      micStreamerRef.current?.stop();
      return;
    }

    // Guardar texto actual para concatenar en vivo la transcripción iterativa
    baseTextBeforeMicRef.current = text.trim();
    setWsIteration(0);

    const streamer = new RealtimeMicStreamer({
      language,
      onStateChange: (nextState) => {
        setMicState(nextState);
        if (nextState.isConnecting) {
          setStatusMessage("Conectando micrófono a ws://.../api/v1/stt/stream...");
        } else if (nextState.isRecording && nextState.isInferring) {
          setStatusMessage("whisper-base transcribiendo fragmentos en tiempo real...");
        } else if (nextState.isRecording) {
          setStatusMessage("Grabando audio del micrófono en tiempo real...");
        }
      },
      onTranscript: (eventData) => {
        const incoming = (eventData.text || "").trim();
        setWsIteration(eventData.iteration || 0);
        if (incoming) {
          const prefix = baseTextBeforeMicRef.current;
          setText(prefix ? `${prefix} ${incoming}` : incoming);
        }
        if (eventData.is_final) {
          setStatusMessage(
            `Transcripción en vivo completada (${eventData.processing_time_ms || 0} ms · ${eventData.model}).`
          );
        }
      },
      onError: (errMsg) => {
        setErrorMessage(errMsg);
        setStatusMessage("Error en streaming WebSocket.");
      },
    });

    micStreamerRef.current = streamer;
    try {
      await streamer.start();
    } catch (err) {
      setErrorMessage(err.message || "No se pudo iniciar el micrófono.");
      setStatusMessage("Fallo al iniciar grabación en vivo.");
    }
  };

  // =========================================================================
  // 2. PANEL "ARCHIVOS DE AUDIO": DRAG & DROP + CLIP (POST /api/v1/stt/upload)
  // =========================================================================
  const processAttachedAudioFile = async (file) => {
    if (!file) return;
    setErrorMessage("");

    try {
      validateAudioAttachment(file);
    } catch (validationErr) {
      setErrorMessage(validationErr.message);
      return;
    }

    const fileId = `${Date.now()}_${file.name}`;
    const newEntry = {
      id: fileId,
      file,
      name: file.name,
      size: file.size,
      status: "processing",
      transcript: "",
      durationSec: null,
      processingMs: null,
    };

    setAttachedFiles((prev) => [newEntry, ...prev]);
    setIsUploadingSTT(true);
    setStatusMessage(
      `Subiendo "${file.name}" a POST /api/v1/stt/upload y ejecutando whisper-base...`
    );

    try {
      const response = await uploadAudioForSTT(file, language);
      const transcribedText = (response.text || "").trim();

      setAttachedFiles((prev) =>
        prev.map((item) =>
          item.id === fileId
            ? {
                ...item,
                status: "done",
                transcript: transcribedText,
                durationSec: response.duration_sec,
                processingMs: response.processing_time_ms,
              }
            : item
        )
      );

      if (transcribedText) {
        setText((prevText) => {
          const cleanPrev = prevText.trim();
          return cleanPrev ? `${cleanPrev}\n${transcribedText}` : transcribedText;
        });
      }

      setStatusMessage(
        `Archivo "${file.name}" transcrito con éxito (${response.processing_time_ms} ms · ${response.model}).`
      );
    } catch (err) {
      setAttachedFiles((prev) =>
        prev.map((item) =>
          item.id === fileId
            ? { ...item, status: "error", error: err.message }
            : item
        )
      );
      setErrorMessage(err.message || "Error al subir el archivo de audio.");
      setStatusMessage("Error al procesar archivo adjunto.");
    } finally {
      setIsUploadingSTT(false);
    }
  };

  const handleOpenClipFilePicker = () => {
    if (isUploadingSTT) return;
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      await processAttachedAudioFile(file);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDraggingOver) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);

    if (isUploadingSTT) return;
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      await processAttachedAudioFile(droppedFile);
    }
  };

  // =========================================================================
  // 3. SÍNTESIS DE VOZ (POST /api/v1/tts) Y CONTROLES DE TRANSPORTE
  // =========================================================================
  const handlePlayOrSynthesize = async () => {
    setErrorMessage("");
    if (!trimmed) {
      setErrorMessage("Escribe, dicta con el micrófono o adjunta un audio antes de reproducir.");
      return;
    }

    setIsGeneratingTTS(true);
    setStatusMessage("Sintetizando audio con modelo ligero piper-tts / VITS...");

    try {
      const wavBlob = await synthesizeTextToAudio(trimmed, selectedVoice);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      const nextUrl = URL.createObjectURL(wavBlob);
      setAudioUrl(nextUrl);
      setStatusMessage("Audio generado con piper-tts. Reproduciendo...");

      setTimeout(() => {
        if (audioPlayerRef.current) {
          audioPlayerRef.current.volume = dsp.volume / 100;
          audioPlayerRef.current.playbackRate = dsp.speed;
          audioPlayerRef.current.play().catch(() => {});
        }
      }, 60);
    } catch (err) {
      setErrorMessage(err.message || "Error al generar audio con piper-tts.");
      setStatusMessage("Error en síntesis TTS.");
    } finally {
      setIsGeneratingTTS(false);
    }
  };

  const handlePauseAudio = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setIsPlayingAudio(false);
      setStatusMessage("Reproducción en pausa.");
    }
  };

  const handleStopAudio = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      setIsPlayingAudio(false);
      setStatusMessage("Reproducción detenida.");
    }
  };

  const handleDownloadAudio = () => {
    if (!audioUrl) {
      handlePlayOrSynthesize();
      return;
    }
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `hakuyomi_tts_${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isAnyModelBusy =
    micState.isConnecting ||
    micState.isInferring ||
    isUploadingSTT ||
    isGeneratingTTS;

  return (
    <div className="voxis-shell">
      {/* BARRA SUPERIOR ESTILO ESTUDIO PROFESIONAL */}
      <header className="voxis-topbar">
        <div className="brand-title">
          <span className="brand-badge">V</span>
          <h1>
            <strong>HAKUYOMI</strong> Studio Pro
          </h1>
          <span className="subtitle-pill">Síntesis &amp; STT Neuronal</span>
        </div>

        <nav className="topbar-actions">
          <button
            type="button"
            className="pill-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Adjuntar archivo de audio (.mp3, .wav)"
          >
            📁 Proyecto
          </button>
          <button
            type="button"
            className={`pill-btn ${micState.isRecording ? "pill-active-mic" : ""}`}
            onClick={handleToggleMicrophone}
          >
            🎙️ Voz a Texto
          </button>
          <button
            type="button"
            className="pill-btn pill-green"
            onClick={handleOpenClipFilePicker}
          >
            📎 Cargar Audio
          </button>
          <button
            type="button"
            className="pill-btn pill-purple"
            onClick={() => setDsp(DEFAULT_DSP)}
          >
            🎛️ Mezclar
          </button>
          <select
            className="lang-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            aria-label="Idioma de transcripción"
          >
            <option value="es">ES (Español)</option>
            <option value="en">EN (English)</option>
          </select>
        </nav>
      </header>

      {/* BANNER DE ALERTA / ERROR SI EXISTE */}
      {errorMessage && (
        <div className="studio-alert" role="alert">
          <span>⚠️ {errorMessage}</span>
          <button
            type="button"
            className="alert-close"
            onClick={() => setErrorMessage("")}
          >
            ✕
          </button>
        </div>
      )}

      {/* CUERPO PRINCIPAL: ÁREA DE TEXTO + PANEL LATERAL "ARCHIVOS DE AUDIO" */}
      <div className="workspace-split">
        {/* COLUMNA IZQUIERDA/CENTRAL: ENTRADA DE TEXTO + BANCO DE VOCES + DSP */}
        <main className="main-console">
          <section className="text-panel">
            <div className="text-panel-header">
              <div className="text-title-group">
                <h2>Entrada de Texto para Síntesis:</h2>
                <span className="counter-label">
                  ({wordCount} palabras • {charCount} caracteres)
                </span>
              </div>

              <div className="text-toolbar">
                {/* BOTÓN INTERACTIVO DE MICRÓFONO EN TIEMPO REAL */}
                <button
                  type="button"
                  onClick={handleToggleMicrophone}
                  disabled={micState.isConnecting}
                  className={`mic-interactive-btn ${
                    micState.isRecording ? "is-recording" : ""
                  }`}
                  title={
                    micState.isRecording
                      ? "Presiona para detener la grabación en vivo"
                      : "Presiona para iniciar grabación por WebSocket (/api/v1/stt/stream)"
                  }
                >
                  {micState.isConnecting ? (
                    <>
                      <span className="spinner spinner-sm" />
                      <span>Conectando...</span>
                    </>
                  ) : micState.isRecording ? (
                    <>
                      <span className="mic-pulse-dot" />
                      <span>Detener Mic ({formatTimer(recordingSeconds)})</span>
                      {micState.isInferring && (
                        <span
                          className="spinner spinner-sm"
                          title="whisper-base transcribiendo..."
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <span className="mic-icon">🎙️</span>
                      <span>Micrófono en Vivo</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="mini-tool-btn"
                  onClick={() => navigator.clipboard?.writeText(text)}
                  title="Copiar texto al portapapeles"
                >
                  📤 Exportar
                </button>
                <button
                  type="button"
                  className="mini-tool-btn"
                  onClick={() => setText("")}
                  title="Limpiar área de texto"
                >
                  🗑️ Limpiar
                </button>
              </div>
            </div>

            {/* TEXTAREA PRINCIPAL CON ACTUALIZACIÓN EN TIEMPO REAL */}
            <div className="textarea-wrapper">
              <textarea
                className={`studio-textarea ${
                  micState.isRecording ? "textarea-recording-glow" : ""
                }`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escribe aquí, presiona el botón de micrófono para dictar en tiempo real por WebSocket, o arrastra un archivo de audio en el panel lateral..."
                rows={7}
              />

              {/* Indicador flotante dentro del cuadro de texto mientras el modelo procesa */}
              {(micState.isRecording || micState.isInferring) && (
                <div className="live-stream-badge">
                  <span className="spinner spinner-xs" />
                  <span>
                    {micState.isInferring
                      ? `whisper-base transcribiendo iteración #${wsIteration + 1}...`
                      : `Escuchando en vivo (WS /api/v1/stt/stream · iteraciones: ${wsIteration})`}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* GRID INFERIOR: BANCO DE VOCES + ECUALIZADOR & DSP */}
          <div className="racks-grid">
            {/* BANCO DE VOCES */}
            <section className="rack-card">
              <div className="rack-header">
                <h3>Banco de Voces:</h3>
                <div className="rack-actions">
                  <span className="model-tag">piper-tts / VITS</span>
                </div>
              </div>

              <div className="voice-list" role="listbox" aria-label="Banco de Voces">
                {VOICE_BANK.map((v) => {
                  const active = selectedVoice === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className={`voice-item ${active ? "voice-item-active" : ""}`}
                      onClick={() => setSelectedVoice(v.id)}
                    >
                      <span className="voice-flag">{v.flag}</span>
                      <span className="voice-name">{v.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ECUALIZADOR & DSP */}
            <section className="rack-card">
              <div className="rack-header">
                <h3>🎛️ Ecualizador &amp; DSP:</h3>
                <select
                  className="preset-select"
                  value={dsp.preset}
                  onChange={(e) => setDsp({ ...dsp, preset: e.target.value })}
                >
                  <option>⚡ Neutro (Bypass)</option>
                  <option>🎙️ Locución Estudio</option>
                  <option>📻 Radio Cálida</option>
                </select>
              </div>

              <div className="dsp-sliders-grid">
                <div className="dsp-control">
                  <label>Velocidad: {dsp.speed.toFixed(1)}x</label>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={dsp.speed}
                    onChange={(e) =>
                      setDsp({ ...dsp, speed: parseFloat(e.target.value) })
                    }
                  />
                </div>

                <div className="dsp-control">
                  <label>Tono: Normal ({dsp.pitch})</label>
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={dsp.pitch}
                    onChange={(e) =>
                      setDsp({ ...dsp, pitch: parseInt(e.target.value, 10) })
                    }
                  />
                </div>

                <div className="dsp-control">
                  <label>🔊 Bajos: {dsp.bass} dB</label>
                  <input
                    type="range"
                    min="-10"
                    max="10"
                    step="1"
                    value={dsp.bass}
                    onChange={(e) =>
                      setDsp({ ...dsp, bass: parseInt(e.target.value, 10) })
                    }
                  />
                </div>

                <div className="dsp-control">
                  <label>✨ Timbre / Brillo: {dsp.treble} dB</label>
                  <input
                    type="range"
                    min="-10"
                    max="10"
                    step="1"
                    value={dsp.treble}
                    onChange={(e) =>
                      setDsp({ ...dsp, treble: parseInt(e.target.value, 10) })
                    }
                  />
                </div>

                <div className="dsp-control">
                  <label>🔁 Eco (Delay): {dsp.delay}%</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={dsp.delay}
                    onChange={(e) =>
                      setDsp({ ...dsp, delay: parseInt(e.target.value, 10) })
                    }
                  />
                </div>

                <div className="dsp-control">
                  <label>🏛️ Reverberación: {dsp.reverb}%</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={dsp.reverb}
                    onChange={(e) =>
                      setDsp({ ...dsp, reverb: parseInt(e.target.value, 10) })
                    }
                  />
                </div>

                <div className="dsp-control">
                  <label>🔈 Volumen: {dsp.volume}%</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={dsp.volume}
                    onChange={(e) =>
                      setDsp({ ...dsp, volume: parseInt(e.target.value, 10) })
                    }
                  />
                </div>

                <div className="dsp-reset-wrap">
                  <button
                    type="button"
                    className="reset-dsp-btn"
                    onClick={() => setDsp(DEFAULT_DSP)}
                  >
                    ↺ Restablecer Efectos
                  </button>
                </div>
              </div>
            </section>
          </div>
        </main>

        {/* PANEL LATERAL DEDICADO A "ARCHIVOS DE AUDIO" (DRAG & DROP + CLIP) */}
        <aside className="audio-files-sidebar">
          <div className="sidebar-header">
            <div>
              <h3>📂 Archivos de Audio</h3>
              <span className="sidebar-subtitle">
                POST /api/v1/stt/upload • Máx. 10 MB
              </span>
            </div>

            {/* BOTÓN DE CLIP PARA ADJUNTAR AUDIOS PREGRABADOS */}
            <button
              type="button"
              className="clip-attach-btn"
              onClick={handleOpenClipFilePicker}
              disabled={isUploadingSTT}
              title="Adjuntar archivo de audio pregrabado (.mp3, .wav)"
            >
              {isUploadingSTT ? (
                <span className="spinner spinner-xs" />
              ) : (
                <span aria-hidden="true">📎</span>
              )}
              <span>Adjuntar</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,audio/mpeg,audio/wav"
              className="hidden-file-input"
              onChange={handleFileInputChange}
            />
          </div>

          {/* ZONA DRAG & DROP */}
          <div
            className={`dropzone-box ${isDraggingOver ? "dropzone-active" : ""} ${
              isUploadingSTT ? "dropzone-loading" : ""
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleOpenClipFilePicker}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleOpenClipFilePicker();
            }}
          >
            {isUploadingSTT ? (
              <div className="dropzone-spinner-state">
                <span className="spinner spinner-lg" />
                <p className="drop-primary-text">
                  Procesando audio con <strong>whisper-base</strong>...
                </p>
                <span className="drop-hint">
                  Validando y transcribiendo en /tmp/hakuyomi_audio
                </span>
              </div>
            ) : (
              <>
                <div className="dropzone-icon">📎</div>
                <p className="drop-primary-text">
                  Arrastra y suelta tu audio aquí
                </p>
                <span className="drop-hint">
                  o haz clic en el clip para seleccionar (.MP3, .WAV hasta 10 MB)
                </span>
              </>
            )}
          </div>

          {/* LISTA DE ARCHIVOS ADJUNTOS PROCESADOS */}
          <div className="attached-files-list">
            <div className="attached-list-title">
              <span>Historial de Adjuntos ({attachedFiles.length})</span>
              {attachedFiles.length > 0 && (
                <button
                  type="button"
                  className="clear-list-btn"
                  onClick={() => setAttachedFiles([])}
                >
                  Limpiar
                </button>
              )}
            </div>

            {attachedFiles.length === 0 ? (
              <div className="empty-attachments">
                Sin archivos adjuntos en esta sesión. Sube un archivo MP3 o WAV para transcribirlo al editor.
              </div>
            ) : (
              attachedFiles.map((item) => (
                <div key={item.id} className={`attachment-card status-${item.status}`}>
                  <div className="attachment-top">
                    <span className="attachment-name" title={item.name}>
                      🎵 {item.name}
                    </span>
                    <span className="attachment-size">{formatBytes(item.size)}</span>
                  </div>

                  {item.status === "processing" && (
                    <div className="attachment-status-row">
                      <span className="spinner spinner-xs" />
                      <span>Transcribiendo con whisper-base...</span>
                    </div>
                  )}

                  {item.status === "done" && (
                    <>
                      <p className="attachment-snippet">
                        {item.transcript || "(Sin voz detectada)"}
                      </p>
                      <div className="attachment-meta">
                        <span>⏱️ {item.durationSec ?? 0}s</span>
                        <span>⚡ {item.processingMs ?? 0} ms</span>
                        <button
                          type="button"
                          className="insert-again-btn"
                          onClick={() =>
                            setText((prev) =>
                              prev.trim()
                                ? `${prev.trim()}\n${item.transcript}`
                                : item.transcript
                            )
                          }
                        >
                          + Insertar
                        </button>
                      </div>
                    </>
                  )}

                  {item.status === "error" && (
                    <div className="attachment-error">❌ {item.error}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      {/* ELEMENTO AUDIO OCULTO PARA REPRODUCCIÓN */}
      <audio
        ref={audioPlayerRef}
        src={audioUrl || undefined}
        onPlay={() => setIsPlayingAudio(true)}
        onPause={() => setIsPlayingAudio(false)}
        onEnded={() => {
          setIsPlayingAudio(false);
          setStatusMessage("Reproducción finalizada.");
        }}
      />

      {/* BARRA DE TRANSPORTE INFERIOR (REPRODUCIR, PAUSAR, DETENER, GUARDAR AUDIO) */}
      <section className="transport-bar">
        <button
          type="button"
          className="transport-btn btn-play-blue"
          onClick={handlePlayOrSynthesize}
          disabled={isGeneratingTTS}
        >
          {isGeneratingTTS ? (
            <>
              <span className="spinner spinner-sm" />
              <span>Sintetizando (piper-tts)...</span>
            </>
          ) : (
            <>
              <span>▶</span>
              <span>Reproducir</span>
            </>
          )}
        </button>

        <button
          type="button"
          className="transport-btn btn-neutral"
          onClick={handlePauseAudio}
          disabled={!isPlayingAudio}
        >
          ⏸ Pausar
        </button>

        <button
          type="button"
          className="transport-btn btn-neutral"
          onClick={handleStopAudio}
          disabled={!audioUrl}
        >
          ⏹ Detener
        </button>

        <button
          type="button"
          className="transport-btn btn-save-orange"
          onClick={handleDownloadAudio}
          disabled={isGeneratingTTS}
        >
          💾 Guardar Audio
        </button>
      </section>

      {/* PIE DE ESTADO DEL ESTUDIO */}
      <footer className="voxis-footer">
        <div className="footer-status">
          {isAnyModelBusy ? (
            <span className="spinner spinner-xs" />
          ) : (
            <span className="status-dot-ok" />
          )}
          <span>{statusMessage}</span>
        </div>

        <div className="footer-badges">
          <span className="hw-badge">🖥️ CPU (int8)</span>
          <span className="engine-badge">🎙️ whisper-base (~140MB)</span>
          <span className="engine-badge">🔊 piper-tts (~150MB)</span>
          <span className="ver-badge">v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}
