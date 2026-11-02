import React, { useEffect, useState } from "react";
import App from "./App.jsx";
import AuthScreen from "./AuthScreen.jsx";
import { logout, onAuthChange, restoreSession } from "./services/auth.js";
import "./Auth.css";

/** Muestra login/registro hasta que haya sesión; luego la aplicación y un botón para salir. */
export default function AuthGate() {
  const [user, setUser] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange(setUser);
    restoreSession().finally(() => setCargando(false));
    return unsubscribe;
  }, []);

  if (cargando) {
    return (
      <div className="auth-page">
        <div className="auth-loading">
          <p className="auth-muted">Cargando…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <>
      <div className="session-bar">
        <span className="session-email" title={user.email}>
          {user.email}
        </span>
        <button type="button" className="session-logout" onClick={() => logout()}>
          Cerrar sesión
        </button>
      </div>
      <App />
    </>
  );
}
