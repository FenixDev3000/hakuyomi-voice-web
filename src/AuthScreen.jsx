import React, { useState } from "react";
import { login, register } from "./services/auth.js";

const FUNCIONES = [
  { icono: "🎙️", titulo: "Voz a texto en vivo", detalle: "Habla y mira la transcripción al instante." },
  { icono: "📎", titulo: "Archivos de audio", detalle: "Sube MP3, WAV, OGG y más, hasta 10 MB." },
  { icono: "🔊", titulo: "Voces neuronales", detalle: "Convierte tu texto en voz natural." },
];

function OndaDeVoz() {
  const alturas = [14, 28, 46, 30, 58, 36, 22, 44, 26, 16];
  return (
    <svg className="auth-wave" viewBox="0 0 160 80" aria-hidden="true" focusable="false">
      {alturas.map((h, i) => (
        <rect key={i} x={8 + i * 15} y={40 - h / 2} width="8" height={h} rx="4" />
      ))}
    </svg>
  );
}

export default function AuthScreen() {
  const [modo, setModo] = useState("login"); // "login" | "registro"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codigo, setCodigo] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const esRegistro = modo === "registro";

  const cambiarModo = (nuevo) => {
    setModo(nuevo);
    setError("");
    setPassword("");
    setCodigo("");
  };

  const enviar = async (event) => {
    event.preventDefault();
    if (enviando) return;
    setError("");
    setEnviando(true);
    try {
      if (esRegistro) await register(email, password, codigo);
      else await login(email, password);
    } catch (err) {
      setError(err.message || "No se pudo completar la operación.");
      setEnviando(false);
    }
  };

  return (
    <div className="auth-page">
      <header className="auth-top">
        <span className="auth-logo" aria-hidden="true">
          V
        </span>
        <span className="auth-wordmark">HAKUYOMI</span>
      </header>

      <main className="auth-card">
        <section className="auth-side" aria-label="Acerca de Hakuyomi Studio Pro">
          <OndaDeVoz />
          <h1>
            Hakuyomi <span>Studio Pro</span>
          </h1>
          <p className="auth-side-text">
            Síntesis de voz y reconocimiento de voz neuronal, en un solo estudio.
          </p>
          <ul className="auth-features">
            {FUNCIONES.map((f) => (
              <li key={f.titulo}>
                <span className="auth-feature-icon" aria-hidden="true">
                  {f.icono}
                </span>
                <span>
                  <strong>{f.titulo}</strong>
                  <small>{f.detalle}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="auth-form-panel">
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={!esRegistro}
              className={!esRegistro ? "active" : ""}
              onClick={() => cambiarModo("login")}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={esRegistro}
              className={esRegistro ? "active" : ""}
              onClick={() => cambiarModo("registro")}
            >
              Crear cuenta
            </button>
          </div>

          <h2>{esRegistro ? "Crea tu cuenta" : "Bienvenido de nuevo"}</h2>
          <p className="auth-lead">
            {esRegistro
              ? "Regístrate para usar el estudio de voz."
              : "Ingresa con tu correo para continuar."}
          </p>

          <form onSubmit={enviar} noValidate>
            <label htmlFor="auth-email">Correo electrónico</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              required
            />

            <label htmlFor="auth-password">Contraseña</label>
            <div className="auth-password">
              <input
                id="auth-password"
                type={verPassword ? "text" : "password"}
                autoComplete={esRegistro ? "new-password" : "current-password"}
                placeholder={esRegistro ? "Mínimo 10 caracteres" : "Tu contraseña"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={128}
                required
              />
              <button
                type="button"
                className="auth-toggle"
                onClick={() => setVerPassword((v) => !v)}
                aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {verPassword ? "Ocultar" : "Ver"}
              </button>
            </div>
            {esRegistro && (
              <p className="auth-hint">Al menos 10 caracteres, con una letra y un número.</p>
            )}

            {esRegistro && (
              <>
                <label htmlFor="auth-codigo">Código único</label>
                <input
                  id="auth-codigo"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Código que te dio el equipo"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  maxLength={128}
                  required
                />
              </>
            )}

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="auth-submit" disabled={enviando}>
              {enviando ? "Procesando…" : esRegistro ? "Crear cuenta" : "Entrar"}
            </button>
          </form>

          <p className="auth-switch">
            {esRegistro ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?"}{" "}
            <button type="button" onClick={() => cambiarModo(esRegistro ? "login" : "registro")}>
              {esRegistro ? "Inicia sesión" : "Regístrate"}
            </button>
          </p>
        </section>
      </main>
    </div>
  );
}
