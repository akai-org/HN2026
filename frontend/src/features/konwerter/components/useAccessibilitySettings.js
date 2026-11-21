// Ustawienia dostępności zapisywane w localStorage i nakładane jako klasy na <html>.
import { useEffect, useState } from "react";

const STORAGE_KEY = "konwerter.dostepnosc";
export const DEFAULT_SETTINGS = { text: "normal", contrast: false, motion: false, underline: false };

function readSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function applySettings(settings) {
  const root = document.documentElement;
  root.classList.toggle("kv-text-lg", settings.text === "lg");
  root.classList.toggle("kv-text-xl", settings.text === "xl");
  root.classList.toggle("kv-hc", settings.contrast);
  root.classList.toggle("kv-reduce-motion", settings.motion);
  root.classList.toggle("kv-underline", settings.underline);
}

/** Ustawienia działają od pierwszego renderu i są zdejmowane po wyjściu z konwertera. */
export function useAccessibilitySettings() {
  const [settings, setSettings] = useState(readSettings);
  useEffect(() => {
    applySettings(settings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Tryb prywatny bez localStorage: ustawienia działają do odświeżenia strony.
    }
  }, [settings]);
  useEffect(() => () => applySettings(DEFAULT_SETTINGS), []);
  return [settings, setSettings];
}

