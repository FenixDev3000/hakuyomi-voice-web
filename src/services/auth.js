/**
 * Sesión del usuario contra hakuyomi-voice-api (/api/v1/auth/*).
 * - access token (corto): solo en memoria.
 * - refresh token (rotativo): en sessionStorage; se borra al cerrar la pestaña.
 */

import { API_BASE_URL } from "./config.js";

const REFRESH_KEY = "hakuyomi.refresh";
const MARGEN_MS = 30_000; // renovar el access token 30 s antes de que venza

let session = { accessToken: null, expiresAt: 0, user: null };
let refreshing = null;
const listeners = new Set();

function leerRefresh() {
  try {
    return sessionStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function guardarRefresh(valor) {
  try {
    if (valor) sessionStorage.setItem(REFRESH_KEY, valor);
    else sessionStorage.removeItem(REFRESH_KEY);
  } catch {
    // sessionStorage no disponible: la sesión dura solo mientras no se recargue la página
  }
}

function avisar() {
  listeners.forEach((fn) => fn(session.user));
}

function aplicarTokens(data) {
  session = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    user: data.user,
  };
  guardarRefresh(data.refresh_token);
  avisar();
}

function limpiarSesion() {
  session = { accessToken: null, expiresAt: 0, user: null };
  guardarRefresh(null);
  avisar();
}

export function mensajeDeError(detail, status) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return "Revisa los datos ingresados.";
  }
  return `Error HTTP ${status}`;
}

async function postJson(path, body) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor.");
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    // sin cuerpo JSON (por ejemplo 204)
  }
  if (!response.ok) {
    throw new Error(mensajeDeError(data?.detail, response.status));
  }
  return data;
}

export function validarCredenciales(email, password, { registro = false } = {}) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim())) {
    throw new Error("Ingresa un correo válido.");
  }
  if (!password) {
    throw new Error("Ingresa tu contraseña.");
  }
  if (registro) {
    if (password.length < 10) {
      throw new Error("La contraseña debe tener al menos 10 caracteres.");
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new Error("La contraseña debe incluir al menos una letra y un número.");
    }
  }
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function currentUser() {
  return session.user;
}

export async function register(email, password) {
  validarCredenciales(email, password, { registro: true });
  aplicarTokens(await postJson("/api/v1/auth/register", { email: email.trim(), password }));
}

export async function login(email, password) {
  validarCredenciales(email, password);
  aplicarTokens(await postJson("/api/v1/auth/login", { email: email.trim(), password }));
}

export async function logout() {
  const refresh = leerRefresh();
  limpiarSesion();
  if (refresh) {
    try {
      await postJson("/api/v1/auth/logout", { refresh_token: refresh });
    } catch {
      // la sesión local ya se cerró; el token expira solo en el servidor
    }
  }
}

/** Renueva la sesión con el refresh token guardado. Cierra la sesión si ya no vale. */
export function refreshSession() {
  if (refreshing) return refreshing;
  const refresh = leerRefresh();
  if (!refresh) {
    limpiarSesion();
    return Promise.reject(new Error("Inicia sesión para continuar."));
  }
  refreshing = postJson("/api/v1/auth/refresh", { refresh_token: refresh })
    .then(aplicarTokens)
    .catch((err) => {
      limpiarSesion();
      throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Al abrir la página: intenta recuperar la sesión con el refresh token. */
export async function restoreSession() {
  if (!leerRefresh()) return null;
  try {
    await refreshSession();
  } catch {
    return null;
  }
  return session.user;
}

export async function getFreshAccessToken() {
  if (!session.accessToken || Date.now() > session.expiresAt - MARGEN_MS) {
    await refreshSession();
  }
  return session.accessToken;
}

/** fetch con Authorization; si responde 401 renueva la sesión y reintenta una vez. */
export async function authFetch(url, options = {}) {
  const enviar = async () => {
    const token = await getFreshAccessToken();
    return fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
  };
  let response = await enviar();
  if (response.status === 401) {
    await refreshSession();
    response = await enviar();
  }
  return response;
}
