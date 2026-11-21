import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../../public/przyklady/", import.meta.url));

/** Wzorcowy JSON COI (formularz 5) — kopia z dane_zadania w public/przyklady. */
export function loadExample() {
  return JSON.parse(readFileSync(`${root}wniosek-o-stwierdzenie-nadplaty-podatku.json`, "utf8"));
}

/** Formularz 1 z dane_zadania (ma niepełne pola, np. "validation": {}) — tylko do testów. */
export function loadForm1() {
  return JSON.parse(readFileSync(new URL("./form1.json", import.meta.url), "utf8"));
}
