import { describe, expect, it } from "vitest";
import {
  MAX_FILE_SIZE_BYTES,
  validateAudioAttachment,
} from "./voiceApi.js";

const archivo = (name, size) => ({ name, size });

describe("validateAudioAttachment", () => {
  it("acepta un audio válido", () => {
    expect(validateAudioAttachment(archivo("voz.mp3", 1024))).toBe(true);
    expect(validateAudioAttachment(archivo("VOZ.WAV", 1024))).toBe(true);
  });

  it("rechaza si no hay archivo", () => {
    expect(() => validateAudioAttachment(null)).toThrow();
  });

  it("rechaza extensiones no permitidas", () => {
    expect(() => validateAudioAttachment(archivo("virus.exe", 1024))).toThrow(/Formato no permitido/);
    expect(() => validateAudioAttachment(archivo("audio.mp3.exe", 1024))).toThrow();
  });

  it("rechaza archivos vacíos", () => {
    expect(() => validateAudioAttachment(archivo("a.wav", 0))).toThrow(/vacío/);
  });

  it("rechaza archivos mayores a 10 MB", () => {
    expect(() => validateAudioAttachment(archivo("a.wav", MAX_FILE_SIZE_BYTES + 1))).toThrow(/10 MB/);
  });
});
