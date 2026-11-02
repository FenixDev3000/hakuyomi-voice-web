import React, { useState } from "react";
import { login, register } from "./services/auth.js";

export default function AuthScreen() {
  const [modo, setModo] = useState("login"); // "login" | "registro"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const esRegistro = modo === "registro";

  const cambiarModo = (nuevo) => {
    setModo(nuevo);
    setError("");
    setPassword("");
  };

  const enviar = async (event) => {
    event.preventDefault();
    if (enviando) return;
    setError("");
    setEnviando(true);
    try {
      if (esRegistro) await register(email, password);
      else await login(email, password);
    } catch (err) {
      setError(err.message || "No se pudo completar la operación.");
      setEnviando(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={enviar} noValidate>
        <div className="auth-brand">
          <span className="auth-logo">V</span>
          <div>
            <h1>
              HAKUYOMI <span>Studio Pro</span>
            </h1>
            <p className="auth-muted">Síntesis y STT neuronal</p>
          </div>
        </div>

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

        <label htmlFor="auth-email">Correo electrónico</label>
        <input
          id="auth-email"
          type="email"
          autoComplete="email"
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
          <p className="auth-hint">Mínimo 10 caracteres, con al menos una letra y un número.</p>
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
    </div>
  );
}
