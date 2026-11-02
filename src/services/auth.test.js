import { describe, expect, it } from "vitest";
import { mensajeDeError, validarCredenciales } from "./auth.js";

describe("validarCredenciales", () => {
  it("acepta correo y contraseña válidos en login", () => {
    expect(() => validarCredenciales("a@b.com", "x")).not.toThrow();
  });

  it("rechaza correo inválido", () => {
    expect(() => validarCredenciales("sin-arroba", "x")).toThrow(/correo/);
    expect(() => validarCredenciales("", "x")).toThrow(/correo/);
  });

  it("rechaza contraseña vacía", () => {
    expect(() => validarCredenciales("a@b.com", "")).toThrow(/contraseña/);
  });

  it("en registro exige 10 caracteres, letra y número", () => {
    const op = { registro: true, codigo: "cualquier-codigo" };
    expect(() => validarCredenciales("a@b.com", "corta1", op)).toThrow(/10 caracteres/);
    expect(() => validarCredenciales("a@b.com", "soloLetrasLargas", op)).toThrow(/número/);
    expect(() => validarCredenciales("a@b.com", "12345678901", op)).toThrow(/letra/);
    expect(() => validarCredenciales("a@b.com", "ClaveSegura2026", op)).not.toThrow();
  });

  it("en registro exige el código único (solo que no esté vacío; lo valida el servidor)", () => {
    const base = { registro: true };
    expect(() => validarCredenciales("a@b.com", "ClaveSegura2026", base)).toThrow(/código único/);
    expect(() => validarCredenciales("a@b.com", "ClaveSegura2026", { ...base, codigo: "   " })).toThrow(
      /código único/
    );
    expect(() => validarCredenciales("a@b.com", "ClaveSegura2026", { ...base, codigo: "x" })).not.toThrow();
  });

  it("el login no pide código único", () => {
    expect(() => validarCredenciales("a@b.com", "x")).not.toThrow();
  });
});

describe("mensajeDeError", () => {
  it("usa el texto del servidor cuando es string", () => {
    expect(mensajeDeError("Correo o contraseña incorrectos.", 401)).toBe("Correo o contraseña incorrectos.");
  });

  it("no filtra detalles de validación y cae a un mensaje genérico", () => {
    expect(mensajeDeError([{ msg: "x" }], 422)).toBe("Revisa los datos ingresados.");
    expect(mensajeDeError(undefined, 500)).toBe("Error HTTP 500");
  });
});
